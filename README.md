# SemCode — Semantic Code Search for LLM Agents

[![VS Code](https://img.shields.io/badge/VS%20Code-^1.85.0-blue.svg)](https://code.visualstudio.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)

**SemCode** is a VS Code extension that exposes language server capabilities via a local HTTP API, enabling LLM agents (Claude Code, GitHub Copilot, etc.) to perform type-aware code navigation without starting a separate language server.

## Why SemCode?

LLM agents typically rely on `grep` and file reading for code navigation — fast but imprecise. SemCode gives them access to the **same semantic understanding** that powers VS Code's "Go to Definition", "Find All References", and hover information:

- **Type-aware symbol search** — find symbols by name or natural language description
- **Resolved type signatures** — get the same hover info developers see in VS Code
- **Cross-file references** — find all usages of a symbol with surrounding context
- **Structural outlines** — understand file structure (imports, exports, classes, methods)
- **Live diagnostics** — check for compilation errors and warnings after code changes
- **Workspace overview** — orient within a project's directory structure and language stats

Works with **any language** supported by VS Code language extensions (TypeScript, Python, Rust, Go, Java, C#, etc.).

## Features

### HTTP API

The extension starts a local HTTP server on `127.0.0.1` that exposes 6 endpoints:

| Endpoint                   | Description                                    |
| -------------------------- | ---------------------------------------------- |
| `POST /search`             | Search for symbols by name or natural language |
| `POST /inspect`            | Get detailed info about a symbol at a location |
| `POST /references`         | Find all references to a symbol with context   |
| `POST /file_outline`       | Get structural outline of a file               |
| `POST /diagnostics`        | Get language server errors and warnings        |
| `POST /workspace_overview` | Get project structure and language statistics  |

No CLI or Node.js installation required — agents use `curl` directly:

```bash
# Discover the port
PORT=$(cat "$HOME/.semcode/ports$(pwd)/port.json" | grep -o '"port":[0-9]*' | grep -o '[0-9]*')

# Search for symbols
curl -s "http://127.0.0.1:${PORT}/search" \
  -H "Content-Type: application/json" \
  -d '{"query": "authentication middleware", "kinds": ["function", "class"], "limit": 10}'

# Inspect a symbol
curl -s "http://127.0.0.1:${PORT}/inspect" \
  -H "Content-Type: application/json" \
  -d '{"file": "src/auth.ts", "line": 42, "include": ["signature", "doc", "body"]}'

# Find all references
curl -s "http://127.0.0.1:${PORT}/references" \
  -H "Content-Type: application/json" \
  -d '{"file": "src/auth.ts", "line": 42, "contextLines": 2}'

# Get file outline
curl -s "http://127.0.0.1:${PORT}/file_outline" \
  -H "Content-Type: application/json" \
  -d '{"file": "src/auth.ts"}'

# Check diagnostics
curl -s "http://127.0.0.1:${PORT}/diagnostics" \
  -H "Content-Type: application/json" \
  -d '{"file": "src/auth.ts", "severity": ["error", "warning"]}'

# Get workspace overview
curl -s "http://127.0.0.1:${PORT}/workspace_overview" \
  -H "Content-Type: application/json" \
  -d '{"depth": 2}'
```

### LLM Skill Installation

Install skill definitions into your workspace so that LLM agents automatically discover and use SemCode:

- **Claude Code** — installs to `.claude/skills/semantic-search/`
- **GitHub Copilot** — installs to `.github/skills/semantic-search/`

The skill file (SKILL.md) contains complete API documentation with port discovery instructions, so agents can use `curl` autonomously. Updates are detected via SHA-256 hash comparison.

### Port Discovery

The extension writes connection info to `~/.semcode/ports/<workspace-path>/port.json`:

```
~/.semcode/ports/home/user/my-project/port.json
```

Content: `{ "port": 54321, "pid": 12345, "workspaceFolders": [...], "timestamp": ... }`

This avoids platform-specific hashing (no `md5sum` vs `md5` differences).

## Getting Started

### 1. Install the Extension

```bash
# Build and install from source
npm install
npm run build
```

Or install the `.vsix` file directly:

```bash
npm run package
code --install-extension lsp-relay.vsix
```

### 2. Install LLM Skills

Run the command palette command:

```
LSP Relay: Install Skill
```

Select your target platform (Claude Code or GitHub Copilot) and the skill files will be created in your workspace.

## Recommended Workflow for LLM Agents

```
1. curl POST /workspace_overview  → Understand project structure
2. curl POST /search              → Find relevant symbols
3. curl POST /inspect             → Get full details (signature, docs, source)
4. curl POST /references          → Understand usage patterns
5. curl POST /diagnostics         → Verify correctness after changes
```

## Commands

| Command                    | Description                          |
| -------------------------- | ------------------------------------ |
| `LSP Relay: Show Status`   | Show HTTP server status and port     |
| `LSP Relay: Install Skill` | Install LLM skill files to workspace |

## Security

- The HTTP server binds to `127.0.0.1` only — not accessible from the network
- No authentication required (local-only access)
- No data leaves the machine
