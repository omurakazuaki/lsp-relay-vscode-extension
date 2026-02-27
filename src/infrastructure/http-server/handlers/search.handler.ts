import { z } from 'zod';
import type { SearchSymbolsUseCase } from '../../../application/use-cases/search-symbols.use-case.js';
import { SearchQuery } from '../../../domain/value-objects/search-query.value-object.js';
import type { AppError } from '../../../domain/errors/app-error.js';

const SearchRequestSchema = z.object({
    query: z.string(),
    scope: z.enum(['workspace', 'file', 'directory']).optional(),
    path: z.string().optional(),
    kinds: z.array(z.string()).optional(),
    limit: z.number().int().positive().optional(),
    include_body: z.boolean().optional(),
});

export interface HttpResponse {
    status: number;
    body: unknown;
}

export class SearchHandler {
    constructor(private readonly useCase: SearchSymbolsUseCase) {}

    async handle(rawBody: unknown): Promise<HttpResponse> {
        // 1. Schema validation
        const parsed = SearchRequestSchema.safeParse(rawBody);
        if (!parsed.success) {
            return {
                status: 400,
                body: { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
            };
        }
        const data = parsed.data;

        // 2. Domain validation
        const queryResult = SearchQuery.create({
            query: data.query,
            scope: data.scope,
            path: data.path,
            kinds: data.kinds,
            limit: data.limit,
            includeBody: data.include_body,
        });
        if (!queryResult.ok) {
            return { status: 400, body: { error: describeError(queryResult.error) } };
        }

        // 3. Use case
        const result = await this.useCase.execute(queryResult.value);
        if (!result.ok) {
            return { status: appErrorToStatus(result.error), body: { error: describeError(result.error) } };
        }

        return { status: 200, body: result.value };
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
