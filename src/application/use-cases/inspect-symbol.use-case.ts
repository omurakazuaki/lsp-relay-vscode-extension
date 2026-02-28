import type { Result } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { SymbolDetail } from '../../domain/entities/symbol-detail.entity.js';
import type { SymbolLocation } from '../../domain/value-objects/symbol-location.value-object.js';
import type { SymbolInspector, InspectField } from '../ports/symbol-inspector.port.js';
import { DEFAULT_INSPECT_FIELDS } from '../ports/symbol-inspector.port.js';

export interface InspectSymbolInput {
    readonly location: SymbolLocation;
    readonly include?: ReadonlyArray<InspectField> | undefined;
}

export class InspectSymbolUseCase {
    constructor(private readonly inspector: SymbolInspector) {}

    async execute(input: InspectSymbolInput): Promise<Result<SymbolDetail, AppError>> {
        const include = input.include ?? DEFAULT_INSPECT_FIELDS;
        return this.inspector.inspect(input.location, include);
    }
}
