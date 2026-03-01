---
name: lsp-resolve
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
  Trigger on: Code Analysis, Code Navigation, Code Understanding
---

# LSP Relay — Type-Aware Code Navigation

The **LSP Relay** extension uses the VS Code language server to provide type-aware code navigation
via a local HTTP API. No CLI or Node.js installation required — use `curl` directly.

## Prerequisites

- VS Code with the **LSP Relay** extension running on the target workspace
- `curl` (standard on Linux/macOS)

## Port Discovery

The extension writes connection info to `~/.semcode/ports/<workspace-path>/port.json`.

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

> **Important:** The `line` must point to a line **within a symbol's range** (its declaration or body).
> Lines outside any symbol (imports, blank lines, comments between declarations) return a 404 error.
> Use `/search` first to get the exact line number, then pass it to `/inspect`.
> You can also use `/file_outline` to discover line numbers of all symbols in a file.

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

> **Limitation:** References rely on the language server's static analysis. Dynamic dispatch
> (e.g., `obj[methodName]()`), computed property access, and indirect references may not be detected.
> Zero results does not necessarily mean a symbol is unused — consider combining with text-based search.

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

> **Note:** Signatures come from the language server's `DocumentSymbol.detail` property.
> Availability varies by language and symbol type — TypeScript typically provides signatures for
> functions and methods, but may return `null` for interfaces, types, or variables.
> For reliable type signatures, use `/inspect` on the symbol's line — it uses the hover provider,
> which provides richer type information.

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

1. **Discover port** — Read `~/.semcode/ports$(pwd)/port.json`
2. **Overview** — `POST /workspace_overview` to understand project structure
3. **Search** — `POST /search` to find relevant symbols
4. **Outline** — `POST /file_outline` to get imports, exports, and structure of a file
5. **Inspect** — `POST /inspect` to get full details on a symbol (signature, docs, body)
6. **References** — `POST /references` to understand usage patterns
7. **Diagnostics** — `POST /diagnostics` to verify correctness after changes

> **Tip:** No single endpoint returns everything. Use `/file_outline` for a file's imports and
> structural overview, then `/inspect` for deep details (resolved types, hover docs, source body)
> on specific symbols.

## Tips

- **Large responses**: For `/inspect` with `body` or `/references` with many results, pipe output to a file:
  `curl -s -X POST ... | jq . > /tmp/result.json`
- **Minimize tokens**: Omit `include_body` in `/search` unless you need source code. Use `/inspect`
  to fetch body for specific symbols instead.
- The `/search` response includes a `truncated` field — if `true`, increase `limit` to see more results.

## Troubleshooting

- **Port file not found**: VS Code extension is not running, or the workspace path doesn't match
- **Connection refused**: Extension may have restarted — re-read the port file
- **Empty results**: Language server may still be initializing — wait a few seconds and retry
- **Truncated JSON output**: The server sends complete JSON. If output appears truncated, your terminal
  may be limiting display length — redirect to a file: `curl ... > /tmp/result.json`
