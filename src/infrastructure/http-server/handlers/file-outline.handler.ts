import { z } from 'zod';
import type { GetFileOutlineUseCase } from '../../../application/use-cases/get-file-outline.use-case.js';
import { type HttpResponse, appErrorToStatus, describeError } from './handler-utils.js';

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
