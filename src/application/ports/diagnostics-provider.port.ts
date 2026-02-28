import type { Result } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { DiagnosticSeverity, FileDiagnostics } from '../../domain/entities/diagnostic.entity.js';

export interface DiagnosticsOptions {
    readonly file: string | null;
    readonly severity: readonly DiagnosticSeverity[];
}

/**
 * Port: returns diagnostics (errors/warnings) from the language server.
 * Implementations live in infrastructure/vscode-adapter/.
 */
export interface DiagnosticsProvider {
    getDiagnostics(options: DiagnosticsOptions): Promise<Result<readonly FileDiagnostics[], AppError>>;
}
