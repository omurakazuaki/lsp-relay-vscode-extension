import type { Result } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { ReferenceProvider, ReferenceProviderResult } from '../ports/reference-provider.port.js';
import type { SymbolLocation } from '../../domain/value-objects/symbol-location.value-object.js';
import { DEFAULT_CONTEXT_LINES, DEFAULT_REF_LIMIT } from '../../shared/constants.js';

export interface FindReferencesInput {
    readonly location: SymbolLocation;
    readonly contextLines?: number | undefined;
    readonly limit?: number | undefined;
}

export class FindReferencesUseCase {
    constructor(private readonly provider: ReferenceProvider) {}

    async execute(input: FindReferencesInput): Promise<Result<ReferenceProviderResult, AppError>> {
        const contextLines = input.contextLines ?? DEFAULT_CONTEXT_LINES;
        const limit = input.limit ?? DEFAULT_REF_LIMIT;
        return this.provider.findReferences(input.location, { contextLines, limit });
    }
}
