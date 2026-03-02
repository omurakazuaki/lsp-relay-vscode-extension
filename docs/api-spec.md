# VS Code Semantic Code Search — API Specification

> **Version:** 1.0 | **Date:** February 2026 | **Status:** DRAFT

---

## 1. Overview

This document specifies the API for the VS Code Semantic Code Search system. The system enables LLM agents to perform semantic code navigation and search by leveraging the language server already running inside VS Code, eliminating the need to start a separate language server process and avoiding redundant indexing.

The system consists of a VS Code extension that exposes an HTTP server on localhost. LLM agents interact with it directly via HTTP (using `curl` or HTTP hooks), guided by a SKILL.md file installed into the workspace.

### 1.1 Design Principles

1. **Minimal tool calls** — LLM agents should reach their goal in as few calls as possible. Each endpoint returns rich, contextual data.
2. **Token efficiency** — Responses are sized appropriately by default. Large payloads (source bodies, full reference lists) are opt-in.
3. **Natural language friendly** — The search endpoint accepts both exact symbol names and natural language queries, since LLMs may not know precise identifiers.
4. **Progressive disclosure** — Start with overviews, drill down into details only when needed.
5. **Language agnostic** — The API works with any language supported by VS Code language extensions (TypeScript, Python, Rust, Go, etc.).

---

## 2. Architecture

The system reuses the existing VS Code language server infrastructure via the `vscode.executeXxxProvider` commands. The extension acts as a bridge, translating HTTP requests into VS Code API calls and returning structured JSON.

### 2.1 Communication Flow

```
LLM Agent ──curl/HTTP──> VS Code Extension (localhost:PORT)
                              │
                              ├── vscode.executeWorkspaceSymbolProvider
                              ├── vscode.executeDefinitionProvider
                              ├── vscode.executeReferenceProvider
                              ├── vscode.executeHoverProvider
                              ├── vscode.executeDocumentSymbolProvider
                              └── vscode.languages.getDiagnostics
                              │
LLM Agent <──JSON────── VS Code Extension
```

### 2.2 Port Discovery

The extension writes connection information to a JSON file on startup. Files are stored per workspace under the user's home directory, using the workspace absolute path to avoid hash computation (no platform-specific tools like `md5sum` required).

```
Location: ~/.semcode/ports/<workspace-absolute-path>/port.json
Example:  ~/.semcode/ports/home/user/project/port.json
```

```json
{
  "port": 49152,
  "pid": 12345,
  "workspaceFolders": ["/home/user/project"],
  "timestamp": 1709000000000
}
```

LLM agents read the port file to discover the server:

```bash
PORT=$(cat "$HOME/.semcode/ports$(pwd)/port.json" | grep -o '"port":[0-9]*' | grep -o '[0-9]*')
curl -sf "http://127.0.0.1:${PORT}/health"
```

> **Security:** The HTTP server binds to `127.0.0.1` only. No authentication is required since access is limited to the local machine.

### 2.3 LLM Skill Installation

The extension can install **skill definitions** into the current workspace so that LLM agents (Claude Code, GitHub Copilot, etc.) automatically discover and use SemCode for code navigation.

**Installation command:** `LSP Relay: Install Skill`

When executed, the command asks the user to select a target LLM platform and creates the following files in the workspace root:

#### Target directories

| Platform       | Skill directory                           |
| -------------- | ----------------------------------------- |
| Claude Code    | `.claude/skills/semantic-search/SKILL.md` |
| GitHub Copilot | `.github/skills/semantic-search/SKILL.md` |

- **`SKILL.md`** — A skill definition file with YAML frontmatter (`name`, `description`) followed by usage instructions including port discovery and `curl`-based API examples.
- **`.gitignore`** — Excludes `port.json` (written dynamically by the extension at runtime).

#### Update behavior

The installer uses SHA-256 hash comparison to detect whether an existing SKILL.md matches the bundled version:

- **Hashes match** → Already up to date, skip.
- **Hashes differ** → SKILL.md has been modified or a new version is available. The user is asked whether to overwrite.
- **File does not exist** → Fresh install, no confirmation needed.

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
| `include_body`  | `boolean`  | No       | Include source code body and type signature (from `DocumentSymbol.detail`) in results. Default: `false`.                    |
| `include_hover` | `boolean`  | No       | Include JSDoc `doc` string via hover provider. Also refines `signature` with resolved types. Default: `false`.               |

#### Response Fields

| Field                 | Type           | Description                                          |
| --------------------- | -------------- | ---------------------------------------------------- |
| `results[]`           | `array`        | Array of matching symbols.                           |
| `results[].symbol`    | `string`       | Symbol name.                                         |
| `results[].kind`      | `string`       | Symbol kind (function, class, interface, etc.).      |
| `results[].signature` | `string\|null` | Type signature. Populated when `include_body` or `include_hover` is true. |
| `results[].doc`       | `string\|null` | JSDoc string. Populated only when `include_hover` is true.                |
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

### 3.2 `POST /references`

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

### 3.3 `POST /file_outline`

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

### 3.4 `POST /diagnostics`

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

## 4. LLM Tool Definitions

The following tool definitions are designed for use with OpenAI Function Calling, Anthropic Tool Use, or MCP (Model Context Protocol). Each tool maps directly to an API endpoint.

### 4.1 Tool Mapping

| Tool Name          | Endpoint             | When to Use                                           |
| ------------------ | -------------------- | ----------------------------------------------------- |
| `code_search`      | `POST /search`       | Primary entry point. Use first to find relevant code. |
| `code_references`  | `POST /references`   | Find all usages. Understand impact of changes.        |
| `code_outline`     | `POST /file_outline` | Understand file structure before reading source.      |
| `code_diagnostics` | `POST /diagnostics`  | Check for errors after changes.                       |

### 4.2 Tool Definitions (JSON Schema)

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
          "description": "Include source code and type signature. Combine with include_hover for JSDoc."
        },
        "include_hover": {
          "type": "boolean",
          "default": false,
          "description": "Include JSDoc doc string via hover provider."
        },
        "limit": { "type": "integer", "default": 15 }
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
  }
]
```

### 4.3 Recommended Usage Pattern

LLM agents should follow this general workflow when working with the codebase:

1. **`code_search`** — Find relevant symbols using natural language or exact names. Use `include_body: true` for signature + source, add `include_hover: true` for JSDoc.
2. **`code_outline`** — Understand a file's imports and symbol structure before reading it.
3. **`code_references`** — Understand usage patterns and change impact.
4. **`code_diagnostics`** — Verify correctness after making changes.

> **Typical Flow:** For a task like "modify authMiddleware to also accept API keys", the agent calls: `code_search("authMiddleware", include_body: true)` → `code_references(file, line)` → [make changes] → `code_diagnostics(file)`. This completes the entire cycle in 3 tool calls.

---

## 5. Error Handling

All endpoints return standard HTTP status codes. Error responses include a JSON body with an `error` field containing a human-readable message.

| Status | Meaning        | Description                                                      |
| ------ | -------------- | ---------------------------------------------------------------- |
| `200`  | OK             | Request succeeded.                                               |
| `400`  | Bad Request    | Invalid parameters (missing required field, invalid type, etc.). |
| `404`  | Not Found      | File not found or symbol not found at the specified location.    |
| `408`  | Timeout        | Language server did not respond within the timeout period.       |
| `500`  | Internal Error | Unexpected error in the extension.                               |
| `503`  | Unavailable    | Language server is not ready (still indexing or not installed).  |

---

## 6. Security Considerations

- **Localhost only:** The HTTP server binds exclusively to `127.0.0.1`. It is not accessible from external networks.
- **No authentication:** Since access is restricted to the local machine, no authentication mechanism is required. If needed in the future, a shared secret via environment variable can be added.
- **Read-only:** The API is strictly read-only. It cannot modify files, execute code, or change VS Code settings.
- **Ephemeral port:** The server uses a dynamically assigned port (port 0), reducing the risk of port conflicts and predictability.

---

## 7. Limitations and Future Work

### 7.1 Current Limitations

- The API depends on VS Code being open with the target workspace loaded.
- Language server quality varies by language. Features like hover information and workspace symbols depend on the installed language extension.
- Natural language search relies on the workspace symbol provider, which performs fuzzy string matching rather than true semantic understanding.
- Multiple VS Code windows require separate port discovery per workspace.

### 7.2 Future Enhancements

- **Embedding-based search:** Integrate vector embeddings for true semantic code search beyond symbol name matching.
- **Call graph:** Add a `/call_graph` endpoint to trace function call chains.
- **MCP server mode:** Expose the API as an MCP server for direct integration with Claude and other LLM platforms.
- **Write operations:** Support code modifications (rename, extract function) via the language server's code actions.
- **WebSocket streaming:** Real-time diagnostic updates and file change notifications.
