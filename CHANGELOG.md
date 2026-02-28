# Changelog

All notable changes to SemCode are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.1.0] — 2026-02-27

### Added

- **Full Clean Architecture implementation** with domain → application → infrastructure layers
- **6 HTTP API endpoints**: `/search`, `/inspect`, `/references`, `/file_outline`, `/diagnostics`, `/workspace_overview`
- **Domain layer**
  - `SymbolLocation` value object with validation
  - `SymbolDetail` entity (inspect results)
  - `FileOutline` entity (outline results)
  - `DiagnosticItem` / `FileDiagnostics` entities
  - `WorkspaceInfo` entity
  - `AppError` discriminated union (`NOT_FOUND | VALIDATION | TIMEOUT | LSP_UNAVAILABLE | INTERNAL`)
- **Application layer — ports**
  - `SymbolSearcher`, `SymbolInspector`, `ReferenceProvider`
  - `FileOutlineProvider`, `DiagnosticsProvider`, `WorkspaceOverviewProvider`
- **Application layer — use cases** (each with unit tests)
  - `SearchSymbolsUseCase`, `InspectSymbolUseCase`, `FindReferencesUseCase`
  - `GetFileOutlineUseCase`, `GetDiagnosticsUseCase`, `GetWorkspaceOverviewUseCase`
- **Infrastructure layer — VS Code adapters**
  - `VscodeSymbolSearcherAdapter` — `vscode.executeWorkspaceSymbolProvider`
  - `VscodeSymbolInspectorAdapter` — hover + document symbols + references + type hierarchy
  - `VscodeReferenceProviderAdapter` — `vscode.executeReferenceProvider` with context lines
  - `VscodeFileOutlineProviderAdapter` — `vscode.executeDocumentSymbolProvider` + import parsing
  - `VscodeDiagnosticsProviderAdapter` — `vscode.languages.getDiagnostics()`
  - `VscodeWorkspaceOverviewProviderAdapter` — file system scan + language stats
- **Infrastructure layer — HTTP handlers** with zod schema validation
- **LLM Skill (SKILL.md)** with curl-based HTTP API documentation
  - SHA-256 hash-based update checking
  - Platforms: Claude Code (`.claude/skills/`), GitHub Copilot (`.github/skills/`)
- **Port discovery** via `~/.semcode/ports/<workspace-path>/port.json`
- **Result type** pattern throughout (`Ok`/`Err`) — no throwing in domain/application

---

## [0.0.1] — 2026-02-27

### Added

- Initial PoC: `/search` endpoint only, with 9 unit tests confirming feasibility
- Clean Architecture skeleton, strict TypeScript config, esbuild bundling
