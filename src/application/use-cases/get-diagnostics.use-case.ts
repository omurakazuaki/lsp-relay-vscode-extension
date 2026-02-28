import type { Result } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { FileDiagnostics } from '../../domain/entities/diagnostic.entity.js';
import type { DiagnosticsProvider } from '../ports/diagnostics-provider.port.js';
import type { DiagnosticSeverity } from '../../domain/entities/diagnostic.entity.js';

export interface GetDiagnosticsInput {
    readonly file?: string | undefined;
    readonly severity?: readonly string[] | undefined;
}

export class GetDiagnosticsUseCase {
    constructor(private readonly provider: DiagnosticsProvider) {}

    async execute(input: GetDiagnosticsInput): Promise<Result<readonly FileDiagnostics[], AppError>> {
        const rawSeverity = input.severity ?? ['error', 'warning'];
        const severity = rawSeverity as readonly DiagnosticSeverity[];
        return this.provider.getDiagnostics({
            file: input.file ?? null,
            severity,
        });
    }
}
