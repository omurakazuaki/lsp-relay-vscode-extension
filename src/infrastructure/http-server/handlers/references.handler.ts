import { z } from 'zod';
import type { FindReferencesUseCase } from '../../../application/use-cases/find-references.use-case.js';
import { SymbolLocation } from '../../../domain/value-objects/symbol-location.value-object.js';
import type { RawReference } from '../../../application/ports/reference-provider.port.js';
import { type HttpResponse, appErrorToStatus, describeError } from './handler-utils.js';

const ReferencesRequestSchema = z.object({
    file: z.string(),
    line: z.number().int().positive(),
    character: z.number().int().nonnegative().optional(),
    context_lines: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().optional(),
    group_by: z.enum(['file', 'none']).optional(),
});

export class ReferencesHandler {
    constructor(private readonly useCase: FindReferencesUseCase) {}

    async handle(rawBody: unknown): Promise<HttpResponse> {
        const parsed = ReferencesRequestSchema.safeParse(rawBody);
        if (!parsed.success) {
            return { status: 400, body: { error: parsed.error.issues[0]?.message ?? 'Invalid request' } };
        }
        const data = parsed.data;

        const locationResult = SymbolLocation.create({
            file: data.file,
            line: data.line,
            character: data.character,
        });
        if (!locationResult.ok) {
            return { status: 400, body: { error: describeError(locationResult.error) } };
        }

        const result = await this.useCase.execute({
            location: locationResult.value,
            contextLines: data.context_lines,
            limit: data.limit,
        });
        if (!result.ok) {
            return { status: appErrorToStatus(result.error), body: { error: describeError(result.error) } };
        }

        const { symbol, total, references } = result.value;
        const groupBy = data.group_by ?? 'file';

        const groupedRefs =
            groupBy === 'file' ? groupByFile(references) : references.map((r) => ({ line: r.line, context: r.context }));

        return { status: 200, body: { symbol, total, references: groupedRefs } };
    }
}

function groupByFile(refs: readonly RawReference[]): Record<string, { line: number; context: string }[]> {
    const grouped: Record<string, { line: number; context: string }[]> = {};
    for (const ref of refs) {
        const arr = grouped[ref.file];
        if (arr) {
            arr.push({ line: ref.line, context: ref.context });
        } else {
            grouped[ref.file] = [{ line: ref.line, context: ref.context }];
        }
    }
    return grouped;
}
