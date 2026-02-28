import type { Result } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { SymbolLocation } from '../../domain/value-objects/symbol-location.value-object.js';

export interface RawReference {
    readonly file: string;   // relative path from workspace root
    readonly line: number;   // 1-based
    readonly context: string;
}

export interface ReferenceProviderResult {
    readonly symbol: string;
    readonly total: number;   // total count before limit
    readonly references: readonly RawReference[];
}

/**
 * Port: finds all usages of a symbol with surrounding context lines.
 * Implementations live in infrastructure/vscode-adapter/.
 */
export interface ReferenceProvider {
    findReferences(
        location: SymbolLocation,
        options: { readonly contextLines: number; readonly limit: number },
    ): Promise<Result<ReferenceProviderResult, AppError>>;
}
