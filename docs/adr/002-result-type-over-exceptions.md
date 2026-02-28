# ADR-002: Result Type Over Exceptions

## Status
Accepted

## Context

Functions that can fail need a way to communicate failure to callers. Options:
1. **Throw exceptions**: Simple, universal, but exceptions are invisible in type signatures
2. **Return `null | T`**: Only works for "not found", can't carry error details
3. **Return `Result<T, E>`**: Explicit in types, forces callers to handle errors

The application has multiple error kinds (`NOT_FOUND`, `VALIDATION`, `TIMEOUT`, `LSP_UNAVAILABLE`, `INTERNAL`) with different HTTP status codes and caller-facing messages.

## Decision

All functions that can fail return `Result<T, AppError>` from `src/shared/result.ts`:

```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

Rules:
- **Domain and application layers**: Never `throw`. Return `Err(...)`.
- **Infrastructure layer**: Catch VS Code / Node exceptions at the boundary; wrap in `Err({ kind: 'LSP_UNAVAILABLE', ... })` or `Err({ kind: 'INTERNAL', ... })`.
- **HTTP handlers**: Translate `AppError` to HTTP status codes using `appErrorToStatus()`.

`AppError` is a discriminated union. Each variant has a unique `kind` field and variant-specific payload fields. TypeScript's exhaustive switch ensures no error kind is silently ignored.

## Consequences

### Positive
- Error handling is visible and explicit — callers are forced to check `result.ok`
- `AppError` variants map cleanly to HTTP status codes (400, 404, 408, 503, 500)
- No unexpected exceptions propagate to the HTTP layer
- Tests can verify error kinds precisely

### Negative
- More verbose than `throw/catch` for simple operations
- Callers must always destructure the result (minor ergonomic cost)
- `describeError()` helper needed to convert errors to user-facing strings
