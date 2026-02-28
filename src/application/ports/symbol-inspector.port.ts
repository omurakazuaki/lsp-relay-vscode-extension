import type { Result } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { SymbolDetail } from '../../domain/entities/symbol-detail.entity.js';
import type { SymbolLocation } from '../../domain/value-objects/symbol-location.value-object.js';

export type InspectField = 'signature' | 'doc' | 'body' | 'references_summary' | 'type_hierarchy';

export const DEFAULT_INSPECT_FIELDS: readonly InspectField[] = ['signature', 'doc', 'body'];

/**
 * Port: retrieves detailed information about a symbol at a specific location.
 * Implementations live in infrastructure/vscode-adapter/.
 */
export interface SymbolInspector {
    inspect(
        location: SymbolLocation,
        include: ReadonlyArray<InspectField>,
    ): Promise<Result<SymbolDetail, AppError>>;
}
