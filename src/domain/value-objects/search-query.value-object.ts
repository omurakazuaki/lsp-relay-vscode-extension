import type { Result } from '../../shared/result.js';
import { Err, Ok } from '../../shared/result.js';
import type { AppError } from '../errors/app-error.js';
import type { SymbolKind } from '../entities/symbol-info.entity.js';
import { DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT } from '../../shared/constants.js';

export type SearchScope = 'workspace' | 'file' | 'directory';

export interface SearchQueryInput {
    readonly query: string;
    readonly scope?: SearchScope | undefined;
    readonly path?: string | undefined;
    readonly kinds?: string[] | undefined;
    readonly limit?: number | undefined;
    readonly includeBody?: boolean | undefined;
    readonly includeHover?: boolean | undefined;
}

/** Validated, immutable search parameters. */
export class SearchQuery {
    private constructor(
        readonly query: string,
        readonly scope: SearchScope,
        readonly path: string | null,
        readonly kinds: ReadonlyArray<SymbolKind> | null,
        readonly limit: number,
        readonly includeBody: boolean,
        readonly includeHover: boolean,
    ) {}

    static create(input: SearchQueryInput): Result<SearchQuery, AppError> {
        if (input.query.trim().length === 0) {
            return Err({ kind: 'VALIDATION', field: 'query', message: 'Query must not be empty' });
        }
        const scope: SearchScope = input.scope ?? 'workspace';
        if ((scope === 'file' || scope === 'directory') && !input.path) {
            return Err({
                kind: 'VALIDATION',
                field: 'path',
                message: `path is required when scope is "${scope}"`,
            });
        }
        const limit = Math.min(input.limit ?? DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
        return Ok(
            new SearchQuery(
                input.query.trim(),
                scope,
                input.path ?? null,
                input.kinds ? (input.kinds as SymbolKind[]) : null,
                limit,
                input.includeBody ?? false,
                input.includeHover ?? false,
            ),
        );
    }
}
