import { z } from 'zod';
import type { GetDiagnosticsUseCase } from '../../../application/use-cases/get-diagnostics.use-case.js';
import { type HttpResponse, appErrorToStatus, describeError } from './handler-utils.js';

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
