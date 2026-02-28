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

### CLI Tool (`semcode`)

A command-line interface for interacting with the API, designed to be invoked by LLM agents as a tool/function call:

```bash
# Search for symbols
semcode search "authentication middleware" --kinds function,class --limit 10

# Inspect a symbol at a specific location
semcode inspect "src/auth.ts:42" --include signature,doc,body

# Find all references
semcode refs "src/auth.ts:42" --context-lines 2 --limit 30

# Get file outline
semcode outline "src/auth.ts" --depth 2

# Check diagnostics
semcode diagnostics src/auth.ts --severity error,warning

# Get workspace overview
semcode overview --depth 2

# Check server status
semcode status
```

### LLM Skill Installation

Install skill definitions into your workspace so that LLM agents automatically discover and use SemCode:

- **Claude Code** — installs to `.claude/skills/semantic-search/`
- **GitHub Copilot** — installs to `.github/skills/semantic-search/`

## Getting Started

### 1. Install the Extension

```bash
# Build and install from source
npm install
npm run install:ext
```

Or install the `.vsix` file directly:

```bash
npm run package
code --install-extension lsp-relay.vsix
```

### 2. Install the CLI

Run the command palette command:

```
LSP Relay: Install CLI
```

This creates a symlink at `~/.local/bin/semcode`. Make sure `~/.local/bin` is in your `PATH`.

> The symlink is automatically updated when the extension is updated — no manual re-installation needed.

### 3. Install LLM Skills (Optional)

Run the command palette command:

```
LSP Relay: Install Skill
```

Select your target platform (Claude Code or GitHub Copilot) and the skill files will be created in your workspace.

## Recommended Workflow for LLM Agents

```
1. semcode overview        → Understand project structure
2. semcode search "<query>" → Find relevant symbols
3. semcode inspect "file:line" → Get full details (signature, docs, source)
4. semcode refs "file:line"    → Understand usage patterns
5. semcode diagnostics      → Verify correctness after changes
```

## Commands

| Command                    | Description                             |
| -------------------------- | --------------------------------------- |
| `LSP Relay: Show Status`   | Show HTTP server status and port        |
| `LSP Relay: Install CLI`   | Install `semcode` CLI to `~/.local/bin` |
| `LSP Relay: Install Skill` | Install LLM skill files to workspace    |

## Security

- The HTTP server binds to `127.0.0.1` only — not accessible from the network
- No authentication required (local-only access)
- No data leaves the machine
