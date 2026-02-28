import { z } from 'zod';
import type { InspectSymbolUseCase } from '../../../application/use-cases/inspect-symbol.use-case.js';
import { SymbolLocation } from '../../../domain/value-objects/symbol-location.value-object.js';
import type { AppError } from '../../../domain/errors/app-error.js';
import type { ReferencesSummary, TypeHierarchy } from '../../../domain/entities/symbol-detail.entity.js';
import type { HttpResponse } from './search.handler.js';

const InspectRequestSchema = z.object({
    file: z.string(),
    line: z.number().int().positive(),
    character: z.number().int().nonnegative().optional(),
    include: z.array(z.enum(['signature', 'doc', 'body', 'references_summary', 'type_hierarchy'])).optional(),
});

export class InspectHandler {
    constructor(private readonly useCase: InspectSymbolUseCase) {}

    async handle(rawBody: unknown): Promise<HttpResponse> {
        const parsed = InspectRequestSchema.safeParse(rawBody);
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
            include: data.include,
        });
        if (!result.ok) {
            return { status: appErrorToStatus(result.error), body: { error: describeError(result.error) } };
        }

        const d = result.value;
        return {
            status: 200,
            body: {
                symbol: d.symbol,
                kind: d.kind,
                ...(d.signature !== undefined ? { signature: d.signature } : {}),
                ...(d.doc !== undefined ? { doc: d.doc } : {}),
                ...(d.body !== undefined ? { body: d.body } : {}),
                ...(d.bodyLines !== undefined ? { body_lines: d.bodyLines } : {}),
                ...(d.referencesSummary !== undefined
                    ? { references_summary: toApiReferencesSummary(d.referencesSummary) }
                    : {}),
                ...(d.typeHierarchy !== undefined
                    ? { type_hierarchy: toApiTypeHierarchy(d.typeHierarchy) }
                    : {}),
            },
        };
    }
}

function toApiReferencesSummary(rs: ReferencesSummary): unknown {
    return { total: rs.total, by_file: rs.byFile };
}

function toApiTypeHierarchy(th: TypeHierarchy | null): unknown {
    if (!th) return null;
    return { extends: th.extends, implements: th.implements };
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
