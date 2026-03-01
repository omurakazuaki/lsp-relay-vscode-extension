import { z } from 'zod';
import type { SearchSymbolsUseCase } from '../../../application/use-cases/search-symbols.use-case.js';
import { SearchQuery } from '../../../domain/value-objects/search-query.value-object.js';
import { type HttpResponse, appErrorToStatus, describeError } from './handler-utils.js';

const SearchRequestSchema = z.object({
    query: z.string(),
    scope: z.enum(['workspace', 'file', 'directory']).optional(),
    path: z.string().optional(),
    kinds: z.array(z.string()).optional(),
    limit: z.number().int().positive().optional(),
    include_body: z.boolean().optional(),
});

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
