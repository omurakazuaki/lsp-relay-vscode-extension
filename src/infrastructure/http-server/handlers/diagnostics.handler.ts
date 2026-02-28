import { z } from 'zod';
import type { GetDiagnosticsUseCase } from '../../../application/use-cases/get-diagnostics.use-case.js';
import type { AppError } from '../../../domain/errors/app-error.js';
import type { HttpResponse } from './search.handler.js';

const DiagnosticsRequestSchema = z.object({
    file: z.string().optional(),
    severity: z.array(z.enum(['error', 'warning', 'info', 'hint'])).optional(),
});

export class DiagnosticsHandler {
    constructor(private readonly useCase: GetDiagnosticsUseCase) {}

    async handle(rawBody: unknown): Promise<HttpResponse> {
        const parsed = DiagnosticsRequestSchema.safeParse(rawBody);
        if (!parsed.success) {
            return { status: 400, body: { error: parsed.error.issues[0]?.message ?? 'Invalid request' } };
        }
        const data = parsed.data;

        const result = await this.useCase.execute({
            file: data.file,
            severity: data.severity,
        });
        if (!result.ok) {
            return { status: appErrorToStatus(result.error), body: { error: describeError(result.error) } };
        }

        const files = result.value;

        // If a specific file was requested, return single-file shape; otherwise array
        if (data.file) {
            const found = files[0];
            if (!found) {
                return { status: 200, body: { file: data.file, diagnostics: [] } };
            }
            return { status: 200, body: { file: found.file, diagnostics: found.diagnostics } };
        }

        return { status: 200, body: files };
    }
}

function appErrorToStatus(err: AppError): number {
    switch (err.kind) {
        case 'VALIDATION': return 400;
        case 'NOT_FOUND': return 404;
        case 'TIMEOUT': return 408;
        case 'LSP_UNAVAILABLE': return 503;
        case 'INTERNAL': return 500;
    }
}

function describeError(err: AppError): string {
    switch (err.kind) {
        case 'VALIDATION': return err.message;
        case 'NOT_FOUND': return `${err.entity} not found: ${err.id}`;
        case 'TIMEOUT': return `Operation timed out: ${err.operation}`;
        case 'LSP_UNAVAILABLE': return `Language server unavailable: ${err.reason}`;
        case 'INTERNAL': return err.message;
    }
}
