# SemCode シーケンス図

## 1. 拡張機能の起動（Composition Root）

VS Code が拡張機能を読み込み、依存関係を組み立ててHTTPサーバーを起動するまでの流れ。

```mermaid
sequenceDiagram
    participant VSCode as VS Code
    participant Ext as extension.ts<br/>(Composition Root)
    participant Adapter as VscodeAdapters<br/>(×6)
    participant UC as UseCases<br/>(×6)
    participant Handler as HTTP Handlers<br/>(×6)
    participant Server as LspRelayHttpServer
    participant PD as port-discovery.ts
    participant FS as File System<br/>(~/.semcode/)

    VSCode->>Ext: activate(context)
    Note over Ext: workspaceRoot = workspaceFolders[0]

    rect rgb(240, 248, 255)
        Note over Ext,Handler: Dependency Injection (構成ルート)
        Ext->>Adapter: new VscodeSymbolSearcherAdapter(workspaceRoot)
        Ext->>Adapter: new VscodeSymbolInspectorAdapter(workspaceRoot)
        Ext->>Adapter: new VscodeReferenceProviderAdapter(workspaceRoot)
        Ext->>Adapter: new VscodeFileOutlineProviderAdapter(workspaceRoot)
        Ext->>Adapter: new VscodeDiagnosticsProviderAdapter(workspaceRoot)
        Ext->>Adapter: new VscodeWorkspaceOverviewProviderAdapter(workspaceRoot)

        Ext->>UC: new SearchSymbolsUseCase(symbolSearcher)
        Ext->>UC: new InspectSymbolUseCase(symbolInspector)
        Ext->>UC: new FindReferencesUseCase(referenceProvider)
        Ext->>UC: new GetFileOutlineUseCase(fileOutlineProvider)
        Ext->>UC: new GetDiagnosticsUseCase(diagnosticsProvider)
        Ext->>UC: new GetWorkspaceOverviewUseCase(overviewProvider)

        Ext->>Handler: new SearchHandler(searchUseCase)
        Ext->>Handler: new InspectHandler(inspectUseCase)
        Ext->>Handler: new ReferencesHandler(refsUseCase)
        Ext->>Handler: new FileOutlineHandler(outlineUseCase)
        Ext->>Handler: new DiagnosticsHandler(diagUseCase)
        Ext->>Handler: new WorkspaceOverviewHandler(overviewUseCase)
    end

    Ext->>Server: new LspRelayHttpServer(handlers)
    Ext->>Server: start()
    Server-->>Ext: port (ephemeral)
    Ext->>PD: writePortFile(workspaceRoot, port)
    PD->>FS: write ~/.semcode/ports/<workspace-path>/port.json
    Note over FS: {port, pid, workspaceFolders, timestamp}

    Ext->>VSCode: registerCommand("lsp-relay.showStatus")
    Ext->>VSCode: registerCommand("lsp-relay.installSkill")
```

## 2. APIリクエストの処理フロー（例: /search）

LLMエージェントからのHTTPリクエスト（curl）が処理される典型的な流れ。

```mermaid
sequenceDiagram
    actor Agent as LLM Agent
    participant PD as ~/.semcode/ports/
    participant Server as HTTP Server<br/>(127.0.0.1)
    participant Handler as SearchHandler
    participant Zod as Zod Schema
    participant VO as SearchQuery<br/>(Value Object)
    participant UC as SearchSymbolsUseCase
    participant Port as SymbolSearcher<br/>(Port Interface)
    participant Adapter as VscodeSymbolSearcher<br/>Adapter
    participant LSP as VS Code LSP<br/>(Language Server)

    Agent->>PD: cat ~/.semcode/ports$(pwd)/port.json
    PD-->>Agent: {port: 54321}

    Agent->>Server: curl POST /search<br/>{"query": "MyClass"}

    Server->>Server: dispatch(req, res)
    Server->>Handler: handle(body)

    rect rgb(255, 248, 240)
        Note over Handler,Zod: ① スキーマバリデーション
        Handler->>Zod: SearchRequestSchema.safeParse(body)
        alt バリデーション失敗
            Zod-->>Handler: {success: false, error}
            Handler-->>Server: {status: 400, error: "VALIDATION"}
        else バリデーション成功
            Zod-->>Handler: {success: true, data}
        end
    end

    rect rgb(240, 255, 240)
        Note over Handler,VO: ② ドメインバリデーション
        Handler->>VO: SearchQuery.create({query, scope, ...})
        alt 作成失敗
            VO-->>Handler: Err({kind: "VALIDATION"})
            Handler-->>Server: {status: 400, error}
        else 作成成功
            VO-->>Handler: Ok(searchQuery)
        end
    end

    rect rgb(248, 240, 255)
        Note over Handler,LSP: ③ ビジネスロジック実行
        Handler->>UC: execute(searchQuery)
        UC->>Port: search(query)
        Note over Port: <<interface>><br/>SymbolSearcher
        Port->>Adapter: search(query)
        Adapter->>LSP: vscode.executeWorkspaceSymbolProvider(query)
        LSP-->>Adapter: vscode.SymbolInformation[]
        Note over Adapter: SymbolKindマッピング<br/>Relevanceスコア計算
        Adapter-->>Port: Result<SymbolInfo[], AppError>
        Port-->>UC: Result<SymbolInfo[], AppError>
        Note over UC: 結果を query.limit で切り詰め
        UC-->>Handler: Ok({results, total, truncated})
    end

    rect rgb(255, 255, 240)
        Note over Handler,Server: ④ レスポンスマッピング
        Handler-->>Server: {status: 200, body: {results, ...}}
    end

    Server-->>Agent: HTTP 200 JSON
```

## 3. エラーハンドリングフロー

各レイヤーでのエラーがHTTPステータスコードにマッピングされる流れ。

```mermaid
sequenceDiagram
    participant Client as LLM Agent
    participant Server as HTTP Server
    participant Handler as Handler
    participant UC as UseCase
    participant Adapter as VS Code Adapter
    participant LSP as VS Code LSP

    Client->>Server: POST /inspect<br/>{"file": "test.ts", "line": 999}
    Server->>Handler: handle(body)
    Handler->>UC: execute(symbolLocation)
    UC->>Adapter: inspect(location, include)
    Adapter->>LSP: vscode.executeHoverProvider(...)
    LSP-->>Adapter: null (シンボル見つからず)
    Adapter-->>UC: Err({kind: "NOT_FOUND", entity: "symbol"})
    UC-->>Handler: Err({kind: "NOT_FOUND"})

    Note over Handler: AppError → HTTPステータス変換
    Note over Handler: NOT_FOUND → 404<br/>VALIDATION → 400<br/>TIMEOUT → 408<br/>LSP_UNAVAILABLE → 503<br/>INTERNAL → 500

    Handler-->>Server: {status: 404, body: {error: ...}}
    Server-->>Client: HTTP 404 JSON
```

## 4. Skillインストール

スキルファイルのインストールフロー。SHA-256ハッシュで更新チェックを行う。

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant VSCode as VS Code
    participant Ext as extension.ts
    participant Skill_Inst as skill-installer.ts
    participant FS as File System

    User->>VSCode: Command: "LSP Relay: Install Skill"
    VSCode->>Ext: command handler

    Ext->>Skill_Inst: installSkill({workspaceRoot, platforms})

    rect rgb(240, 248, 255)
        Note over Skill_Inst,FS: SHA-256 Hash Check
        Skill_Inst->>FS: readFile(SKILL.md) — bundled version
        Skill_Inst->>Skill_Inst: sha256(bundledContent)
        Skill_Inst->>FS: readFile(existing SKILL.md)
        alt 未インストール
            Note over Skill_Inst: fresh install
        else ハッシュ一致
            Note over Skill_Inst: skip (already up to date)
        else ハッシュ不一致
            Skill_Inst->>Ext: onConflict(skillMdPath)
            Ext->>VSCode: showWarningMessage("Overwrite?")
            VSCode-->>Ext: user choice
        end
    end

    rect rgb(248, 255, 240)
        Note over Skill_Inst,FS: Platform: claude
        Skill_Inst->>FS: mkdir {root}/.claude/skills/semantic-search/
        Skill_Inst->>FS: write SKILL.md
        Skill_Inst->>FS: ensure .gitignore (port.json)
    end

    rect rgb(255, 248, 240)
        Note over Skill_Inst,FS: Platform: copilot
        Skill_Inst->>FS: mkdir {root}/.github/skills/semantic-search/
        Skill_Inst->>FS: write SKILL.md
        Skill_Inst->>FS: ensure .gitignore (port.json)
    end

    Skill_Inst-->>Ext: {installed: [...], skipped: [], errors: []}
    Ext->>VSCode: showInformationMessage("Skills installed")
```

## 5. 全エンドポイント一覧とレイヤー依存関係

```mermaid
sequenceDiagram
    participant Agent as LLM Agent<br/>(curl)
    participant HTTP as HTTP Server<br/>(Node http)
    participant H as Handlers<br/>(Zod validation)
    participant UC as Use Cases<br/>(Business Logic)
    participant P as Ports<br/>(Interfaces)
    participant A as VS Code Adapters
    participant VS as VS Code API

    Note over Agent,VS: POST /search
    Agent->>HTTP: curl POST /search
    HTTP->>H: SearchHandler
    H->>UC: SearchSymbolsUseCase
    UC->>P: SymbolSearcher.search()
    P->>A: VscodeSymbolSearcherAdapter
    A->>VS: executeWorkspaceSymbolProvider

    Note over Agent,VS: POST /inspect
    Agent->>HTTP: curl POST /inspect
    HTTP->>H: InspectHandler
    H->>UC: InspectSymbolUseCase
    UC->>P: SymbolInspector.inspect()
    P->>A: VscodeSymbolInspectorAdapter
    A->>VS: executeHoverProvider<br/>executeDocumentSymbolProvider<br/>executeReferenceProvider

    Note over Agent,VS: POST /references
    Agent->>HTTP: curl POST /references
    HTTP->>H: ReferencesHandler
    H->>UC: FindReferencesUseCase
    UC->>P: ReferenceProvider.findReferences()
    P->>A: VscodeReferenceProviderAdapter
    A->>VS: executeReferenceProvider

    Note over Agent,VS: POST /file_outline
    Agent->>HTTP: curl POST /file_outline
    HTTP->>H: FileOutlineHandler
    H->>UC: GetFileOutlineUseCase
    UC->>P: FileOutlineProvider.getOutline()
    P->>A: VscodeFileOutlineProviderAdapter
    A->>VS: executeDocumentSymbolProvider

    Note over Agent,VS: POST /diagnostics
    Agent->>HTTP: curl POST /diagnostics
    HTTP->>H: DiagnosticsHandler
    H->>UC: GetDiagnosticsUseCase
    UC->>P: DiagnosticsProvider.getDiagnostics()
    P->>A: VscodeDiagnosticsProviderAdapter
    A->>VS: languages.getDiagnostics()

    Note over Agent,VS: POST /workspace_overview
    Agent->>HTTP: curl POST /workspace_overview
    HTTP->>H: WorkspaceOverviewHandler
    H->>UC: GetWorkspaceOverviewUseCase
    UC->>P: WorkspaceOverviewProvider.getOverview()
    P->>A: VscodeWorkspaceOverviewProviderAdapter
    A->>VS: workspace.workspaceFolders<br/>languages.getDiagnostics()
```

## 6. レイヤー間の依存方向（アーキテクチャ概要）

```mermaid
sequenceDiagram
    participant D as Domain Layer<br/>entities / value-objects / errors
    participant S as Shared Layer<br/>Result<T,E> / constants
    participant A as Application Layer<br/>ports / use-cases
    participant I as Infrastructure Layer<br/>adapters / http / cli

    Note over D: 外部依存ゼロ
    Note over S: 外部依存ゼロ

    A->>D: imports entities, value-objects, errors
    A->>S: imports Result, constants

    I->>A: imports ports (interfaces), use-cases
    I->>D: imports entities, value-objects
    I->>S: imports Result, constants

    Note over D,I: 依存の方向は常に外側→内側<br/>(Clean Architecture)
    Note over I: 外部ライブラリ:<br/>- Node.js http (HTTPサーバー)<br/>- vscode API (LSP連携)<br/>- zod (バリデーション)
```
