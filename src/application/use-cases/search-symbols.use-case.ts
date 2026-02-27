import type { Result } from '../../shared/result.js';
import { Ok } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { SymbolInfo } from '../../domain/entities/symbol-info.entity.js';
import type { SearchQuery } from '../../domain/value-objects/search-query.value-object.js';
import type { SymbolSearcher } from '../ports/symbol-searcher.port.js';

export interface SearchSymbolsOutput {
    readonly results: SymbolInfo[];
    readonly total: number;
    readonly truncated: boolean;
}

export class SearchSymbolsUseCase {
    constructor(private readonly searcher: SymbolSearcher) {}

    async execute(query: SearchQuery): Promise<Result<SearchSymbolsOutput, AppError>> {
        const searchResult = await this.searcher.search(query);
        if (!searchResult.ok) return searchResult;

        const all = searchResult.value;
        const truncated = all.length > query.limit;
        const results = all.slice(0, query.limit);

        return Ok({ results, total: all.length, truncated });
    }
}
