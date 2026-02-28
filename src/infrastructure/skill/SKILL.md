---
name: semantic-search
description: >-
  Executes LSP-based exact code analysis via HTTP API.
  Use this tool for mathematically precise code structures, resolved types,
  and exact symbol references without text-match noise.
  Actions:
  - search: Find specific symbols (class, function, interface) by name or description.
  - inspect: Get hover documentation, resolved type signatures, and source code.
  - refs: Find exact usage locations of a specific symbol.
  - outline: Get structural tree of imports, exports, and symbols in a file.
  - diagnostics: Get live language server errors/warnings.
  - overview: Get high-level workspace summary.
---

# SemCode — Semantic Code Search

SemCode uses the VS Code language server to provide type-aware code navigation
via a local HTTP API. No CLI or Node.js installation required — use `curl` directly.

## Prerequisites

- VS Code with the **LSP Relay** extension running on the target workspace
- `curl` (standard on Linux/macOS)

## Port Discovery

### Option A — Fixed port (recommended for HTTP hooks)

Set **`semcode.port`** in VS Code settings to a fixed value (e.g. `4238`):

```json
// .vscode/settings.json
{ "semcode.port": 4238 }
```

The server will always listen on `http://127.0.0.1:4238`. No shell command needed — configure Claude Code HTTP hooks directly:

```json
// .claude/settings.json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [{ "type": "http", "url": "http://127.0.0.1:4238/health" }]
      }
    ]
  }
}
```

### Option B — Dynamic port (default)

When `semcode.port` is `0` (the default), the OS assigns a random port each time VS Code starts.
Read the port from the file the extension writes on startup:

```bash
# Read port for the current workspace
PORT=$(cat "$HOME/.semcode/ports$(pwd)/port.json" | grep -o '"port": [0-9]*' | grep -o '[0-9]*')

# Verify the server is reachable
curl -sf "http://127.0.0.1:${PORT}/health"
```

## API Reference

All endpoints accept `POST` with a JSON body. Base URL: `http://127.0.0.1:${PORT}`

Responses are JSON. File paths in responses are relative to the workspace root.

---

### POST /search — Find symbols across the workspace

**Use first** to find relevant code by name or natural language description.

```bash
curl -s -X POST "http://127.0.0.1:${PORT}/search" \
  -H 'Content-Type: application/json' \
  -d '{"query": "handleRequest", "kinds": ["function"], "limit": 10}'
```

| Parameter      | Type     | Required | Default   | Description                                                        |
| -------------- | -------- | -------- | --------- | ------------------------------------------------------------------ |
| `query`        | string   | **Yes**  |           | Symbol name or natural language query                              |
| `kinds`        | string[] | No       | all       | function, class, interface, type, variable, method, property, enum |
| `scope`        | string   | No       | workspace | workspace, file, directory                                         |
| `path`         | string   | No       |           | Required when scope is file or directory                           |
| `limit`        | integer  | No       | 15        | Max results                                                        |
| `include_body` | boolean  | No       | false     | Include source code (increases response size)                      |

---

### POST /inspect — Get detailed symbol information

Use after `/search` to dive deeper into a specific result.

```bash
curl -s -X POST "http://127.0.0.1:${PORT}/inspect" \
  -H 'Content-Type: application/json' \
  -d '{"file": "src/handler.ts", "line": 42, "include": ["signature", "doc", "body"]}'
```

| Parameter   | Type     | Required | Default              | Description                                                      |
| ----------- | -------- | -------- | -------------------- | ---------------------------------------------------------------- |
| `file`      | string   | **Yes**  |                      | Relative file path                                               |
| `line`      | integer  | **Yes**  |                      | 1-based line number                                              |
| `character` | integer  | No       | 0                    | 0-based character offset                                         |
| `include`   | string[] | No       | signature, doc, body | Fields: signature, doc, body, references_summary, type_hierarchy |

---

### POST /references — Find all usages of a symbol

```bash
curl -s -X POST "http://127.0.0.1:${PORT}/references" \
  -H 'Content-Type: application/json' \
  -d '{"file": "src/handler.ts", "line": 42, "context_lines": 2, "limit": 30}'
```

| Parameter       | Type    | Required | Default | Description                                |
| --------------- | ------- | -------- | ------- | ------------------------------------------ |
| `file`          | string  | **Yes**  |         | Relative file path                         |
| `line`          | integer | **Yes**  |         | 1-based line number                        |
| `context_lines` | integer | No       | 2       | Lines of surrounding context per reference |
| `limit`         | integer | No       | 30      | Max references                             |

---

### POST /file_outline — Get file structure

```bash
curl -s -X POST "http://127.0.0.1:${PORT}/file_outline" \
  -H 'Content-Type: application/json' \
  -d '{"file": "src/handler.ts", "depth": 2}'
```

| Parameter            | Type    | Required | Default | Description                        |
| -------------------- | ------- | -------- | ------- | ---------------------------------- |
| `file`               | string  | **Yes**  |         | Relative file path                 |
| `depth`              | integer | No       | 2       | Nesting depth (1 = top-level only) |
| `include_signatures` | boolean | No       | true    | Include function/method signatures |

---

### POST /diagnostics — Get errors and warnings

```bash
# Single file
curl -s -X POST "http://127.0.0.1:${PORT}/diagnostics" \
  -H 'Content-Type: application/json' \
  -d '{"file": "src/handler.ts", "severity": ["error", "warning"]}'

# Entire workspace (omit file)
curl -s -X POST "http://127.0.0.1:${PORT}/diagnostics" \
  -H 'Content-Type: application/json' \
  -d '{"severity": ["error", "warning"]}'
```

| Parameter  | Type     | Required | Default        | Description                               |
| ---------- | -------- | -------- | -------------- | ----------------------------------------- |
| `file`     | string   | No       |                | Specific file (omit for entire workspace) |
| `severity` | string[] | No       | error, warning | Filter: error, warning, info              |

---

### POST /workspace_overview — Get workspace summary

```bash
curl -s -X POST "http://127.0.0.1:${PORT}/workspace_overview" \
  -H 'Content-Type: application/json' \
  -d '{"depth": 2, "include_stats": true}'
```

| Parameter       | Type    | Required | Default | Description                 |
| --------------- | ------- | -------- | ------- | --------------------------- |
| `depth`         | integer | No       | 2       | Directory tree depth        |
| `include_stats` | boolean | No       | true    | Include language statistics |

---

## Recommended Workflow

1. **Resolve base URL** — Use `http://127.0.0.1:<port>` where `<port>` is the fixed port from settings, or read from `~/.semcode/ports$(pwd)/port.json`
2. **Overview** — `POST /workspace_overview` to understand project structure
3. **Search** — `POST /search` to find relevant symbols
4. **Inspect** — `POST /inspect` to get full details on a symbol
5. **References** — `POST /references` to understand usage patterns
6. **Diagnostics** — `POST /diagnostics` to verify correctness after changes

## Troubleshooting

- **Port file not found**: VS Code extension is not running, or the workspace path doesn't match
- **Connection refused**: Extension may have restarted — re-read the port file, or check that the fixed port is correctly set in `semcode.port`
- **Empty results**: Language server may still be initializing — wait a few seconds and retry
- **Fixed port not working**: Another process may be using the port — change `semcode.port` to a different value and restart VS Code
