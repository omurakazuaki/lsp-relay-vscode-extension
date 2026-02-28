import { z } from 'zod';
import type { GetFileOutlineUseCase } from '../../../application/use-cases/get-file-outline.use-case.js';
import type { AppError } from '../../../domain/errors/app-error.js';
import type { HttpResponse } from './search.handler.js';

const FileOutlineRequestSchema = z.object({
    file: z.string(),
    depth: z.number().int().positive().optional(),
    include_signatures: z.boolean().optional(),
});

export class FileOutlineHandler {
    constructor(private readonly useCase: GetFileOutlineUseCase) {}

    async handle(rawBody: unknown): Promise<HttpResponse> {
        const parsed = FileOutlineRequestSchema.safeParse(rawBody);
        if (!parsed.success) {
            return { status: 400, body: { error: parsed.error.issues[0]?.message ?? 'Invalid request' } };
        }
        const data = parsed.data;

        if (!data.file || data.file.trim().length === 0) {
            return { status: 400, body: { error: 'file is required' } };
        }

        const result = await this.useCase.execute({
            file: data.file,
            depth: data.depth,
            includeSignatures: data.include_signatures,
        });
        if (!result.ok) {
            return { status: appErrorToStatus(result.error), body: { error: describeError(result.error) } };
        }

        // FileOutline fields match the API spec (camelCase matches for most fields)
        const { file, language, lines, imports, symbols } = result.value;
        return { status: 200, body: { file, language, lines, imports, symbols } };
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
