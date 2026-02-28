---
name: semantic-search
description: >-
  Executes LSP-based exact code analysis.
  Use this tool to get mathematically precise code structures, resolved types, and exact symbol references without text-match noise.
  Actions:
  - refs: Find exact usage locations of a specific symbol.
  - inspect: Get hover documentation and resolved type signatures.
  - outline: Get structural tree of imports, exports, and symbols in a file.
  - diagnostics: Get live language server errors/warnings.
  - search: Find specific symbols (class, function, interface) by kind.
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
