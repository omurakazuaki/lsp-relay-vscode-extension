# VS Code Semantic Code Search — API Specification

> **Version:** 1.0 | **Date:** February 2026 | **Status:** DRAFT

---

## 1. Overview

This document specifies the API for the VS Code Semantic Code Search system. The system enables LLM agents to perform semantic code navigation and search by leveraging the language server already running inside VS Code, eliminating the need to start a separate language server process and avoiding redundant indexing.

The system consists of two components: a VS Code extension that exposes an HTTP server on localhost, and a CLI tool that communicates with this server. The CLI is designed to be invoked by LLM agents as a tool/function call.

### 1.1 Design Principles

1. **Minimal tool calls** — LLM agents should reach their goal in as few calls as possible. Each endpoint returns rich, contextual data.
2. **Token efficiency** — Responses are sized appropriately by default. Large payloads (source bodies, full reference lists) are opt-in.
3. **Natural language friendly** — The search endpoint accepts both exact symbol names and natural language queries, since LLMs may not know precise identifiers.
4. **Progressive disclosure** — Start with overviews, drill down into details only when needed.
5. **Language agnostic** — The API works with any language supported by VS Code language extensions (TypeScript, Python, Rust, Go, etc.).

---

## 2. Architecture

The system reuses the existing VS Code language server infrastructure via the `vscode.executeXxxProvider` commands. The extension acts as a bridge, translating HTTP requests from the CLI into VS Code API calls and returning structured JSON.

### 2.1 Communication Flow

```
CLI Tool ──HTTP POST──> VS Code Extension (localhost:PORT)
                              │
                              ├── vscode.executeWorkspaceSymbolProvider
                              ├── vscode.executeDefinitionProvider
                              ├── vscode.executeReferenceProvider
                              ├── vscode.executeHoverProvider
                              ├── vscode.executeDocumentSymbolProvider
                              └── vscode.languages.getDiagnostics
                              │
CLI Tool <──JSON────── VS Code Extension
```

### 2.2 Port Discovery

The extension writes connection information to a JSON file on startup. The CLI reads this file to determine the port. Files are stored per workspace to support multiple VS Code windows.

```
Location: $TMPDIR/vscode-semantic-search-<workspace_hash>.json
```

```json
{
  "port": 49152,
  "pid": 12345,
  "workspaceFolders": ["/home/user/project"],
  "timestamp": 1709000000000
}
```

> **Security:** The HTTP server binds to `127.0.0.1` only. No authentication is required since access is limited to the local machine.

### 2.3 CLI Installation

The CLI (`semcode`) is bundled inside the extension's `out/cli.js`. To make it available as a system command, the extension provides a VS Code command that creates a symbolic link.

**Installation command:** `LSP Relay: Install CLI`

This command creates a symlink at `~/.local/bin/semcode` → `<extensionPath>/out/cli.js`. The user must ensure `~/.local/bin` is in their `PATH`.

#### Symlink auto-repair on extension update

VS Code installs extensions into versioned directories (e.g., `~/.vscode/extensions/local.lsp-relay-0.1.0/`). When the extension is updated, the old directory is removed and a new one is created, which **breaks** existing symlinks.

To handle this, the extension checks on every activation whether a symlink at the target path already exists. If it does but points to an outdated path (i.e., the old extension version), the symlink is automatically updated to point to the new `cli.js` location. This makes CLI updates transparent to the user — after the first manual install, subsequent extension updates are reflected in the CLI automatically.

```
Activation flow:
  1. Check if ~/.local/bin/semcode exists
  2. If it is a symlink pointing to a different extensionPath → update it
  3. If it does not exist → do nothing (user has not opted in)
```

> **Note:** The symlink points to the file, not a copy. No separate CLI update step is needed after the initial install.

### 2.4 LLM Skill Installation

The extension can install **skill definitions** into the current workspace so that LLM agents (Claude Code, GitHub Copilot, etc.) automatically discover and use SemCode for code navigation.

**Installation command:** `LSP Relay: Install SKILL`

When executed, the command asks the user to select a target LLM platform and creates the following files in the workspace root:

#### Target directories

| Platform       | Skill directory                           | Scripts directory                                |
| -------------- | ----------------------------------------- | ------------------------------------------------ |
| Claude Code    | `.claude/skills/semantic-search/SKILL.md` | `.claude/skills/semantic-search/scripts/semcode` |
| GitHub Copilot | `.github/skills/semantic-search/SKILL.md` | `.github/skills/semantic-search/scripts/semcode` |

- **`SKILL.md`** — A skill definition file with YAML frontmatter (`name`, `description`) followed by usage instructions for SemCode commands.
- **`scripts/semcode`** — A symbolic link to the installed `semcode` CLI (`~/.local/bin/semcode`). This allows the LLM to invoke `semcode` relative to the skill directory.

#### SKILL.md template

````markdown
---
name: semantic-search
description: >-
  Use when you need to search for symbols, inspect code details, find references,
  or navigate the codebase using VS Code's language server capabilities.
  Prefer this over grep or file reading for type-aware code navigation.
---

# SemCode — Semantic Code Search

SemCode leverages the VS Code language server to provide type-aware code
navigation. The `semcode` CLI is available at `scripts/semcode`.

## When to Use

- Finding function, class, or type definitions by name or description
- Inspecting detailed type signatures, documentation, and source code
- Finding all references and usages of a symbol across the workspace
- Understanding file structure (imports, exports, classes, functions)
- Checking for compilation errors and warnings
- Getting a high-level overview of the project structure

## Commands

```bash
# Search for symbols by name or description
semcode search "<query>" [--kinds function,class] [--limit 10]

# Inspect a symbol at a specific location
semcode inspect "<file>:<line>" [--include signature,doc,body]

# Find all references to a symbol
semcode refs "<file>:<line>" [--context-lines 2] [--limit 30]

# Get file outline (imports, exports, symbols)
semcode outline "<file>" [--depth 2]

# Check diagnostics (errors, warnings)
semcode diagnostics [<file>] [--severity error,warning]

# Get workspace overview
semcode overview [--depth 2]
```

## Recommended Workflow

1. `semcode overview` — Understand project structure
2. `semcode search "<query>"` — Find relevant symbols
3. `semcode inspect "<file>:<line>"` — Get full details
4. `semcode refs "<file>:<line>"` — Understand usage patterns
5. `semcode diagnostics` — Verify correctness after changes
````

#### Prerequisite

The `semcode` CLI must be installed first (Section 2.3). If it is not installed when `Install Skills` is executed, the command will prompt the user to install it first.

#### Overwrite behavior

If the skill files already exist, the command asks for confirmation before overwriting. This prevents accidental loss of user customizations to the SKILL.md.

---

## 3. API Endpoints

All endpoints accept `POST` requests with a JSON body and return JSON responses. The base URL is `http://127.0.0.1:{port}`. File paths in responses are relative to the workspace root unless otherwise noted.

---

### 3.1 `POST /search`

Primary entry point for code exploration. Searches for symbols across the workspace using natural language queries or exact symbol names. This is the endpoint LLM agents should call first when looking for relevant code.

#### Request Parameters

| Parameter      | Type       | Required | Description                                                                                                                  |
| -------------- | ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `query`        | `string`   | **Yes**  | Search query. Symbol name (e.g. `authMiddleware`) or natural language (e.g. `authentication logic`).                         |
| `scope`        | `string`   | No       | Search scope. One of: `workspace` (default), `file`, `directory`.                                                            |
| `path`         | `string`   | No       | File or directory path. Required when scope is `file` or `directory`.                                                        |
| `kinds`        | `string[]` | No       | Filter by symbol kind: `function`, `class`, `interface`, `type`, `variable`, `method`, `property`, `enum`. Null returns all. |
| `limit`        | `integer`  | No       | Maximum number of results. Default: `15`.                                                                                    |
| `include_body` | `boolean`  | No       | Include source code body in results. Default: `false`. Warning: significantly increases response size.                       |

#### Response Fields

| Field                 | Type           | Description                                          |
| --------------------- | -------------- | ---------------------------------------------------- |
| `results[]`           | `array`        | Array of matching symbols.                           |
| `results[].symbol`    | `string`       | Symbol name.                                         |
| `results[].kind`      | `string`       | Symbol kind (function, class, interface, etc.).      |
| `results[].signature` | `string`       | Full type signature from the language server.        |
| `results[].doc`       | `string\|null` | JSDoc/docstring extracted from hover information.    |
| `results[].file`      | `string`       | Relative file path from workspace root.              |
| `results[].line`      | `integer`      | 1-based line number.                                 |
| `results[].container` | `string`       | Containing class, module, or namespace.              |
| `results[].exported`  | `boolean`      | Whether the symbol is exported.                      |
| `results[].body`      | `string\|null` | Source code (only when `include_body=true`).         |
| `results[].relevance` | `number`       | Relevance score (0.0 to 1.0).                        |
| `total`               | `integer`      | Total number of matches found.                       |
| `truncated`           | `boolean`      | True if results were limited by the limit parameter. |

#### Example

**Request:**

```json
{
  "query": "authentication middleware",
  "kinds": ["function"],
  "limit": 10
}
```

**Response:**

```json
{
  "results": [
    {
      "symbol": "authMiddleware",
      "kind": "function",
      "signature": "(req: Request, res: Response, next: NextFunction) => Promise<void>",
      "doc": "Validates JWT token and attaches user to request.",
      "file": "src/middleware/auth.ts",
      "line": 42,
      "container": "module",
      "exported": true,
      "body": null,
      "relevance": 0.95
    }
  ],
  "total": 3,
  "truncated": false
}
```

> **Note:** The `signature` and `doc` fields are extracted from the language server's hover information. If the language server does not provide this data for a particular symbol, these fields will be `null`.

---

### 3.2 `POST /inspect`

Retrieves detailed information about a specific symbol at a given file location. Use after `/search` to dive deeper into a particular result. Supports selective field inclusion to minimize response size.

#### Request Parameters

| Parameter   | Type       | Required | Description                                                                                                               |
| ----------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `file`      | `string`   | **Yes**  | Relative file path from workspace root.                                                                                   |
| `line`      | `integer`  | **Yes**  | 1-based line number of the symbol.                                                                                        |
| `character` | `integer`  | No       | 0-based character offset. If omitted, the primary symbol on the line is used.                                             |
| `include`   | `string[]` | No       | Fields to include: `signature`, `doc`, `body`, `references_summary`, `type_hierarchy`. Default: `[signature, doc, body]`. |

#### Response Fields

| Field                        | Type           | Description                                    |
| ---------------------------- | -------------- | ---------------------------------------------- |
| `symbol`                     | `string`       | Symbol name.                                   |
| `kind`                       | `string`       | Symbol kind.                                   |
| `signature`                  | `string`       | Full type signature.                           |
| `doc`                        | `string\|null` | Documentation string.                          |
| `body`                       | `string\|null` | Full source code of the symbol.                |
| `body_lines`                 | `[int, int]`   | Start and end line numbers of the body.        |
| `references_summary`         | `object`       | Reference count and locations grouped by file. |
| `references_summary.total`   | `integer`      | Total number of references.                    |
| `references_summary.by_file` | `object`       | Map of file path to array of line numbers.     |
| `type_hierarchy`             | `object\|null` | Inheritance info: `implements` and `extends`.  |

#### Example

**Request:**

```json
{
  "file": "src/middleware/auth.ts",
  "line": 42,
  "include": ["signature", "doc", "body", "references_summary"]
}
```

**Response:**

```json
{
  "symbol": "authMiddleware",
  "kind": "function",
  "signature": "(req: Request, res: Response, next: NextFunction) => Promise<void>",
  "doc": "Validates JWT token and attaches user to request.\n@throws UnauthorizedError if token is invalid",
  "body": "export async function authMiddleware(req: Request, ...) {\n  const token = req.headers.authorization?.split(' ')[1];\n  ...\n}",
  "body_lines": [42, 68],
  "references_summary": {
    "total": 12,
    "by_file": {
      "src/routes/api.ts": [15, 23, 47],
      "src/routes/admin.ts": [8],
      "src/app.ts": [31]
    }
  }
}
```

---

### 3.3 `POST /references`

Finds all usage locations of a symbol. Results include surrounding context lines for each reference, enabling the LLM to understand how the symbol is used without additional tool calls.

#### Request Parameters

| Parameter       | Type      | Required | Description                                                               |
| --------------- | --------- | -------- | ------------------------------------------------------------------------- |
| `file`          | `string`  | **Yes**  | Relative file path from workspace root.                                   |
| `line`          | `integer` | **Yes**  | 1-based line number of the symbol.                                        |
| `character`     | `integer` | No       | 0-based character offset.                                                 |
| `context_lines` | `integer` | No       | Number of lines before and after each reference to include. Default: `2`. |
| `limit`         | `integer` | No       | Maximum number of references. Default: `30`.                              |
| `group_by`      | `string`  | No       | Grouping strategy: `file` (default) or `none`.                            |

#### Response Fields

| Field                        | Type      | Description                                                  |
| ---------------------------- | --------- | ------------------------------------------------------------ |
| `symbol`                     | `string`  | The resolved symbol name.                                    |
| `total`                      | `integer` | Total reference count.                                       |
| `references`                 | `object`  | When `group_by=file`: map of file paths to reference arrays. |
| `references[file][].line`    | `integer` | Line number of the reference.                                |
| `references[file][].context` | `string`  | Surrounding code lines as a single string.                   |

#### Example

**Request:**

```json
{
  "file": "src/middleware/auth.ts",
  "line": 42,
  "context_lines": 2,
  "limit": 30
}
```

**Response:**

```json
{
  "symbol": "authMiddleware",
  "total": 12,
  "references": {
    "src/routes/api.ts": [
      {
        "line": 15,
        "context": "import { authMiddleware } from '../middleware/auth';\n...\nrouter.use(authMiddleware);"
      }
    ],
    "src/app.ts": [
      {
        "line": 31,
        "context": "app.use('/api', authMiddleware, apiRouter);"
      }
    ]
  }
}
```

---

### 3.4 `POST /file_outline`

Returns the structural outline of a file: imports, exports, classes, functions, and their signatures. Enables the LLM to understand a file's purpose and contents before reading its full source.

#### Request Parameters

| Parameter            | Type      | Required | Description                                          |
| -------------------- | --------- | -------- | ---------------------------------------------------- |
| `file`               | `string`  | **Yes**  | Relative file path from workspace root.              |
| `depth`              | `integer` | No       | Nesting depth. `1` = top-level only. Default: `2`.   |
| `include_signatures` | `boolean` | No       | Include function/method signatures. Default: `true`. |

#### Response Fields

| Field      | Type      | Description                                                                                   |
| ---------- | --------- | --------------------------------------------------------------------------------------------- |
| `file`     | `string`  | File path.                                                                                    |
| `language` | `string`  | Detected language identifier.                                                                 |
| `lines`    | `integer` | Total line count.                                                                             |
| `imports`  | `array`   | Import statements with module names and imported identifiers.                                 |
| `symbols`  | `array`   | Array of symbol objects with `name`, `kind`, `signature`, `line`, `exported`, and `children`. |

#### Example

**Request:**

```json
{ "file": "src/middleware/auth.ts" }
```

**Response:**

```json
{
  "file": "src/middleware/auth.ts",
  "language": "typescript",
  "lines": 120,
  "imports": [
    { "module": "jsonwebtoken", "names": ["verify", "JwtPayload"] },
    { "module": "../types", "names": ["User", "AuthRequest"] }
  ],
  "symbols": [
    {
      "name": "AuthConfig",
      "kind": "interface",
      "signature": "interface AuthConfig { secret: string; issuer: string; }",
      "line": 8,
      "exported": true,
      "children": []
    },
    {
      "name": "authMiddleware",
      "kind": "function",
      "signature": "(req: Request, res: Response, next: NextFunction) => Promise<void>",
      "line": 42,
      "exported": true,
      "children": []
    },
    {
      "name": "validateToken",
      "kind": "function",
      "signature": "(token: string, config: AuthConfig) => JwtPayload",
      "line": 70,
      "exported": false,
      "children": []
    }
  ]
}
```

---

### 3.5 `POST /diagnostics`

Returns current errors, warnings, and informational diagnostics from the language server. Use after making code changes to verify correctness, or to discover existing issues.

#### Request Parameters

| Parameter  | Type       | Required | Description                                                                  |
| ---------- | ---------- | -------- | ---------------------------------------------------------------------------- |
| `file`     | `string`   | No       | Specific file path. Omit to return diagnostics for the entire workspace.     |
| `severity` | `string[]` | No       | Filter by severity: `error`, `warning`, `info`. Default: `[error, warning]`. |

#### Response Fields

| Field                     | Type          | Description                                  |
| ------------------------- | ------------- | -------------------------------------------- |
| `file`                    | `string`      | File path.                                   |
| `diagnostics[]`           | `array`       | Array of diagnostic objects.                 |
| `diagnostics[].line`      | `integer`     | 1-based line number.                         |
| `diagnostics[].character` | `integer`     | 0-based character offset.                    |
| `diagnostics[].severity`  | `string`      | One of: `error`, `warning`, `info`.          |
| `diagnostics[].message`   | `string`      | Diagnostic message from the language server. |
| `diagnostics[].source`    | `string`      | Source (e.g. `typescript`, `eslint`).        |
| `diagnostics[].code`      | `string\|int` | Diagnostic code (e.g. TS error number).      |
| `diagnostics[].context`   | `string`      | The source line containing the diagnostic.   |

#### Example

**Request:**

```json
{
  "file": "src/middleware/auth.ts",
  "severity": ["error"]
}
```

**Response:**

```json
{
  "file": "src/middleware/auth.ts",
  "diagnostics": [
    {
      "line": 55,
      "character": 12,
      "severity": "error",
      "message": "Property 'userId' does not exist on type 'JwtPayload'.",
      "source": "typescript",
      "code": 2339,
      "context": "  const userId = payload.userId;"
    }
  ]
}
```

---

### 3.6 `POST /workspace_overview`

Provides a high-level summary of the workspace: directory structure, languages, file counts, and active diagnostics. The LLM should call this at the beginning of a task to orient itself within the project.

#### Request Parameters

| Parameter       | Type      | Required | Description                                   |
| --------------- | --------- | -------- | --------------------------------------------- |
| `depth`         | `integer` | No       | Directory tree depth. Default: `2`.           |
| `include_stats` | `boolean` | No       | Include language statistics. Default: `true`. |

#### Response Fields

| Field                | Type       | Description                                           |
| -------------------- | ---------- | ----------------------------------------------------- |
| `name`               | `string`   | Workspace/project name.                               |
| `root`               | `string`   | Absolute path to workspace root.                      |
| `languages`          | `object`   | Map of language to `{files, lines}` counts.           |
| `structure`          | `string[]` | Indented directory tree as an array of strings.       |
| `entry_points`       | `string[]` | Detected entry points (from package.json main, etc.). |
| `active_diagnostics` | `object`   | Counts of current errors and warnings.                |

#### Example

**Request:**

```json
{ "depth": 2 }
```

**Response:**

```json
{
  "name": "my-api-server",
  "root": "/home/user/projects/my-api-server",
  "languages": {
    "typescript": { "files": 45, "lines": 8200 },
    "json": { "files": 3, "lines": 120 }
  },
  "structure": [
    "src/",
    "  app.ts",
    "  middleware/",
    "    auth.ts",
    "    logging.ts",
    "  routes/",
    "    api.ts",
    "    admin.ts",
    "  models/",
    "  types/",
    "test/",
    "package.json",
    "tsconfig.json"
  ],
  "entry_points": ["src/app.ts"],
  "active_diagnostics": {
    "errors": 2,
    "warnings": 5
  }
}
```

---

## 4. CLI Interface

The CLI provides a command-line wrapper around the HTTP API, designed for invocation by LLM agents via tool/function definitions. All commands output JSON to stdout.

### 4.1 Commands

| Command                         | Description                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `semcode search <query>`        | Search for symbols. Flags: `--kinds`, `--scope`, `--path`, `--limit`, `--include-body`    |
| `semcode inspect <file>:<line>` | Get detailed symbol info. Flag: `--include <fields>`                                      |
| `semcode refs <file>:<line>`    | Find all references. Flags: `--context-lines`, `--limit`                                  |
| `semcode outline <file>`        | Get file structure. Flag: `--depth`                                                       |
| `semcode diagnostics [file]`    | Get errors/warnings. Flag: `--severity`                                                   |
| `semcode overview`              | Get workspace summary. Flag: `--depth`                                                    |
| `semcode status`                | Check if VS Code extension is running and reachable.                                      |
| `semcode install-skills`        | Install LLM skill definitions into the workspace. Flag: `--target <claude\|copilot\|all>` |

### 4.2 Global Flags

| Flag                    | Description                                                            |
| ----------------------- | ---------------------------------------------------------------------- |
| `--workspace <path>`    | Explicitly specify workspace root (auto-detected from cwd by default). |
| `--format json\|pretty` | Output format. Default: `json` (compact, for LLM consumption).         |
| `--timeout <ms>`        | Request timeout in milliseconds. Default: `10000`.                     |

---

## 5. LLM Tool Definitions

The following tool definitions are designed for use with OpenAI Function Calling, Anthropic Tool Use, or MCP (Model Context Protocol). Each tool maps directly to a CLI command and an API endpoint.

### 5.1 Tool Mapping

| Tool Name            | Endpoint                   | When to Use                                           |
| -------------------- | -------------------------- | ----------------------------------------------------- |
| `code_search`        | `POST /search`             | Primary entry point. Use first to find relevant code. |
| `code_inspect`       | `POST /inspect`            | Deep dive into a specific symbol found via search.    |
| `code_references`    | `POST /references`         | Find all usages. Understand impact of changes.        |
| `code_outline`       | `POST /file_outline`       | Understand file structure before reading source.      |
| `code_diagnostics`   | `POST /diagnostics`        | Check for errors after changes.                       |
| `workspace_overview` | `POST /workspace_overview` | Orient within the project at task start.              |

### 5.2 Tool Definitions (JSON Schema)

```json
[
  {
    "name": "code_search",
    "description": "Search for symbols, functions, classes, types across the codebase. Use natural language or exact symbol names. Start here when you need to find relevant code.",
    "parameters": {
      "type": "object",
      "required": ["query"],
      "properties": {
        "query": {
          "type": "string",
          "description": "Search query. Can be a symbol name like 'authMiddleware' or natural language like 'authentication logic'"
        },
        "kinds": {
          "type": "array",
          "items": {
            "enum": [
              "function",
              "class",
              "interface",
              "type",
              "variable",
              "method",
              "property",
              "enum"
            ]
          },
          "description": "Filter by symbol kind. Omit to search all kinds."
        },
        "scope": {
          "enum": ["workspace", "file", "directory"],
          "default": "workspace"
        },
        "path": {
          "type": "string",
          "description": "Required when scope is 'file' or 'directory'"
        },
        "include_body": {
          "type": "boolean",
          "default": false,
          "description": "Include full source code of each result. Warning: increases response size significantly."
        },
        "limit": { "type": "integer", "default": 15 }
      }
    }
  },
  {
    "name": "code_inspect",
    "description": "Get detailed information about a specific symbol at a file location. Use after code_search to dive deeper into a result.",
    "parameters": {
      "type": "object",
      "required": ["file", "line"],
      "properties": {
        "file": { "type": "string" },
        "line": { "type": "integer" },
        "include": {
          "type": "array",
          "items": {
            "enum": [
              "signature",
              "doc",
              "body",
              "references_summary",
              "type_hierarchy"
            ]
          },
          "default": ["signature", "doc", "body"]
        }
      }
    }
  },
  {
    "name": "code_references",
    "description": "Find all usages of a symbol. Use to understand impact of changes or how something is used.",
    "parameters": {
      "type": "object",
      "required": ["file", "line"],
      "properties": {
        "file": { "type": "string" },
        "line": { "type": "integer" },
        "context_lines": { "type": "integer", "default": 2 },
        "limit": { "type": "integer", "default": 30 }
      }
    }
  },
  {
    "name": "code_outline",
    "description": "Get the structure of a file: imports, exports, classes, functions with signatures. Use to understand a file before reading it.",
    "parameters": {
      "type": "object",
      "required": ["file"],
      "properties": {
        "file": { "type": "string" },
        "depth": { "type": "integer", "default": 2 }
      }
    }
  },
  {
    "name": "code_diagnostics",
    "description": "Get current errors and warnings from the language server.",
    "parameters": {
      "type": "object",
      "properties": {
        "file": {
          "type": "string",
          "description": "Specific file, or omit for entire workspace"
        },
        "severity": {
          "type": "array",
          "items": { "enum": ["error", "warning", "info"] },
          "default": ["error", "warning"]
        }
      }
    }
  },
  {
    "name": "workspace_overview",
    "description": "Get project structure, languages, and high-level stats. Use at the start of a task to orient yourself.",
    "parameters": {
      "type": "object",
      "properties": {
        "depth": { "type": "integer", "default": 2 }
      }
    }
  }
]
```

### 5.3 Recommended Usage Pattern

LLM agents should follow this general workflow when working with the codebase:

1. **`workspace_overview`** — Understand project structure and languages.
2. **`code_search`** — Find relevant symbols using natural language or exact names.
3. **`code_inspect`** — Get full details (source, type info, docs) for specific symbols.
4. **`code_references`** — Understand usage patterns and change impact.
5. **`code_diagnostics`** — Verify correctness after making changes.

> **Typical Flow:** For a task like "modify authMiddleware to also accept API keys", the agent calls: `workspace_overview` → `code_search("authMiddleware")` → `code_inspect(file, line)` → `code_references(file, line)` → [make changes] → `code_diagnostics(file)`. This completes the entire cycle in 5 tool calls.

---

## 6. Error Handling

All endpoints return standard HTTP status codes. Error responses include a JSON body with an `error` field containing a human-readable message.

| Status | Meaning        | Description                                                      |
| ------ | -------------- | ---------------------------------------------------------------- |
| `200`  | OK             | Request succeeded.                                               |
| `400`  | Bad Request    | Invalid parameters (missing required field, invalid type, etc.). |
| `404`  | Not Found      | File not found or symbol not found at the specified location.    |
| `408`  | Timeout        | Language server did not respond within the timeout period.       |
| `500`  | Internal Error | Unexpected error in the extension.                               |
| `503`  | Unavailable    | Language server is not ready (still indexing or not installed).  |

The CLI tool translates these into appropriate exit codes: `0` for success, `1` for client errors, `2` for server/connection errors.

---

## 7. Security Considerations

- **Localhost only:** The HTTP server binds exclusively to `127.0.0.1`. It is not accessible from external networks.
- **No authentication:** Since access is restricted to the local machine, no authentication mechanism is required. If needed in the future, a shared secret via environment variable can be added.
- **Read-only:** The API is strictly read-only. It cannot modify files, execute code, or change VS Code settings.
- **Ephemeral port:** The server uses a dynamically assigned port (port 0), reducing the risk of port conflicts and predictability.

---

## 8. Limitations and Future Work

### 8.1 Current Limitations

- The API depends on VS Code being open with the target workspace loaded.
- Language server quality varies by language. Features like hover information and workspace symbols depend on the installed language extension.
- Natural language search relies on the workspace symbol provider, which performs fuzzy string matching rather than true semantic understanding.
- Multiple VS Code windows require separate port discovery per workspace.

### 8.2 Future Enhancements

- **Embedding-based search:** Integrate vector embeddings for true semantic code search beyond symbol name matching.
- **Call graph:** Add a `/call_graph` endpoint to trace function call chains.
- **MCP server mode:** Expose the API as an MCP server for direct integration with Claude and other LLM platforms.
- **Write operations:** Support code modifications (rename, extract function) via the language server's code actions.
- **WebSocket streaming:** Real-time diagnostic updates and file change notifications.
