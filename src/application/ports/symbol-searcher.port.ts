import type { Result } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { SymbolInfo } from '../../domain/entities/symbol-info.entity.js';
import type { SearchQuery } from '../../domain/value-objects/search-query.value-object.js';

/**
 * Port: searches for symbols within a workspace or file.
 * Implementations live in infrastructure/vscode-adapter/.
 */
export interface SymbolSearcher {
    /**
     * Search for symbols matching the given query.
     * Returns an untruncated list; truncation is handled by the use case.
     */
    search(query: SearchQuery): Promise<Result<SymbolInfo[], AppError>>;
}
