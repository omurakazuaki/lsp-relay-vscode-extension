export type AppError =
    | { kind: 'NOT_FOUND'; entity: string; id: string }
    | { kind: 'VALIDATION'; field: string; message: string }
    | { kind: 'TIMEOUT'; operation: string; ms: number }
    | { kind: 'LSP_UNAVAILABLE'; reason: string }
    | { kind: 'INTERNAL'; message: string; cause?: unknown };
