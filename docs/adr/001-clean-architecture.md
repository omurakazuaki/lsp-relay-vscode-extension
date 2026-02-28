# ADR-001: Clean Architecture with DDD

## Status
Accepted

## Context

SemCode bridges VS Code's language server to LLM agents via HTTP. The implementation needs to:
1. Be unit-testable without VS Code running (domain/application tests must not import `vscode`)
2. Support multiple implementations (VS Code adapter today, potentially LSP server adapter tomorrow)
3. Be maintainable as the API surface grows from 1 to 6 endpoints

Multiple architectural approaches were considered:
- **Flat structure**: All code in one layer, quick to write but untestable without VS Code
- **Layered MVC**: Standard but doesn't enforce the "vscode is only in adapters" constraint
- **Clean Architecture**: Strict inward-only dependency rule enforced by ESLint

## Decision

Adopt Clean Architecture with Domain-Driven Design principles:

```
src/
  shared/        → No dependencies (Result type, constants)
  domain/        → No dependencies (entities, value objects, errors)
  application/   → Depends on domain + shared (use cases, ports)
  infrastructure → Depends on application + domain + shared (adapters, handlers, CLI)
```

ESLint rules enforce the import boundaries. VS Code's `vscode` module is only allowed in `infrastructure/vscode-adapter/`.

Port interfaces (e.g., `SymbolSearcher`) are defined in `application/ports/`. Implementations live in `infrastructure/vscode-adapter/`. This enables unit testing use cases by injecting mock implementations.

## Consequences

### Positive
- Domain and application tests run in Node without VS Code (fast, CI-friendly)
- Adding a new endpoint follows a clear, consistent pattern
- VS Code coupling is isolated; future adapters (direct LSP, etc.) are straightforward
- Type safety enforced end-to-end with Result types (no hidden throws)

### Negative
- More files per feature (port + use case + test + adapter + handler)
- Initial setup overhead vs. a flat approach
- Barrel exports banned to avoid circular dependencies, requiring explicit import paths
