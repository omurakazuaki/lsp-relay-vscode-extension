export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

export interface DiagnosticItem {
    readonly line: number;          // 1-based
    readonly character: number;     // 0-based
    readonly severity: DiagnosticSeverity;
    readonly message: string;
    readonly source: string | null;
    readonly code: string | number | null;
    readonly context: string | null; // the source line containing the diagnostic
}

export interface FileDiagnostics {
    readonly file: string; // relative path from workspace root
    readonly diagnostics: readonly DiagnosticItem[];
}
