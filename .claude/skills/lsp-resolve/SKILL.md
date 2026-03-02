---
name: lsp-resolve
description: >-
  Executes LSP-based exact code analysis via HTTP API.
  Use this tool for mathematically precise code structures, resolved types,
  and exact symbol references without text-match noise.
  Actions:
  - search: Find symbols by name; include_body for signature+source, include_hover for JSDoc.
  - refs: Find exact usage locations of a specific symbol.
  - outline: Get structural tree of imports, exports, and symbols in a file.
  - diagnostics: Get live language server errors/warnings.
  Trigger on: Code Analysis, Code Navigation, Code Understanding
---

# LSP Relay — Type-Aware Code Navigation

The **LSP Relay** extension uses the VS Code language server to provide type-aware code navigation
via a local HTTP API. No CLI or Node.js installation required — use `curl` directly.

## Prerequisites

- VS Code with the **LSP Relay** extension running on the target workspace
- `curl` (standard on Linux/macOS)

## Port Discovery

The extension writes the port to `~/.semcode/ports/<workspace-path>/port.json`.

> **IMPORTANT:** Shell variables do not persist across separate Bash invocations.
> Always define `PORT` and run `curl` in the **same command**.

```bash
# Health check — port discovery + curl in one command
PORT=$(cat "$HOME/.semcode/ports$(pwd)/port.json" | grep -o '"port": [0-9]*' | grep -o '[0-9]*') && \
curl -sf "http://127.0.0.1:${PORT}/health"
```

Use this pattern for every API call:

```bash
PORT=$(cat "$HOME/.semcode/ports$(pwd)/port.json" | grep -o '"port": [0-9]*' | grep -o '[0-9]*') && \
curl -s -X POST "http://127.0.0.1:${PORT}/<endpoint>" \
  -H 'Content-Type: application/json' \
  -d '<body>'
```

## API Reference

All endpoints accept `POST` with a JSON body. Responses are JSON. File paths are relative to the workspace root.

---

### POST /search — Find symbols across the workspace

**Use first** to find relevant code by name or natural language description.

```bash
PORT=$(cat "$HOME/.semcode/ports$(pwd)/port.json" | grep -o '"port": [0-9]*' | grep -o '[0-9]*') && \
curl -s -X POST "http://127.0.0.1:${PORT}/search" \
  -H 'Content-Type: application/json' \
  -d '{"query": "handleRequest", "kinds": ["function"], "limit": 10}'
```

| Parameter       | Type     | Required | Default   | Description                                                        |
| --------------- | -------- | -------- | --------- | ------------------------------------------------------------------ |
| `query`         | string   | **Yes**  |           | Symbol name or natural language query                              |
| `kinds`         | string[] | No       | all       | function, class, interface, type, variable, method, property, enum |
| `scope`         | string   | No       | workspace | workspace, file, directory                                         |
| `path`          | string   | No       |           | Required when scope is file or directory                           |
| `limit`         | integer  | No       | 15        | Max results                                                        |
| `include_body`  | boolean  | No       | false     | Include source code body                                           |
| `include_hover` | boolean  | No       | false     | Include type `signature` and JSDoc `doc` via hover provider        |

> **Tip:** Use `include_hover: true` for type signatures and JSDoc. Use `include_body: true` for source code. Combine both for everything.

### POST /references — Find all usages of a symbol

```bash
PORT=$(cat "$HOME/.semcode/ports$(pwd)/port.json" | grep -o '"port": [0-9]*' | grep -o '[0-9]*') && \
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
PORT=$(cat "$HOME/.semcode/ports$(pwd)/port.json" | grep -o '"port": [0-9]*' | grep -o '[0-9]*') && \
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
> For reliable type signatures, use `/search` with `include_hover: true` — it calls the hover
> provider which provides richer type information.

---

### POST /diagnostics — Get errors and warnings

```bash
# Single file
PORT=$(cat "$HOME/.semcode/ports$(pwd)/port.json" | grep -o '"port": [0-9]*' | grep -o '[0-9]*') && \
curl -s -X POST "http://127.0.0.1:${PORT}/diagnostics" \
  -H 'Content-Type: application/json' \
  -d '{"file": "src/handler.ts", "severity": ["error", "warning"]}'

# Entire workspace (omit file)
PORT=$(cat "$HOME/.semcode/ports$(pwd)/port.json" | grep -o '"port": [0-9]*' | grep -o '[0-9]*') && \
curl -s -X POST "http://127.0.0.1:${PORT}/diagnostics" \
  -H 'Content-Type: application/json' \
  -d '{"severity": ["error", "warning"]}'
```

| Parameter  | Type     | Required | Default        | Description                               |
| ---------- | -------- | -------- | -------------- | ----------------------------------------- |
| `file`     | string   | No       |                | Specific file (omit for entire workspace) |
| `severity` | string[] | No       | error, warning | Filter: error, warning, info              |

---

## Recommended Workflow

1. **Search** — `POST /search` to find relevant symbols. Use `include_body: true` for signature + source. Add `include_hover: true` when JSDoc is also needed.
2. **Outline** — `POST /file_outline` to get imports, exports, and structure of a file
3. **References** — `POST /references` to understand usage patterns
4. **Diagnostics** — `POST /diagnostics` to verify correctness after changes

## Tips

- **Parse JSON**: Pipe output through `python3 -m json.tool` for readable output.
  `curl -s -X POST ... | python3 -m json.tool`
- **Large responses**: Redirect to a file to avoid terminal truncation:
  `curl -s -X POST ... > /tmp/result.json && python3 -m json.tool /tmp/result.json`
- **Minimize tokens**: Use `include_hover: true` for type signatures and JSDoc. Use `include_body: true` for source code. Combine both for everything.
- The `/search` response includes a `truncated` field — if `true`, increase `limit` to see more results.

## Troubleshooting

- **Port file not found**: VS Code extension is not running, or the workspace path doesn't match
- **Connection refused**: Extension may have restarted — re-read the port file
- **Empty results**: Language server may still be initializing — wait a few seconds and retry
- **Truncated JSON output**: Redirect to a file: `curl ... > /tmp/result.json`
