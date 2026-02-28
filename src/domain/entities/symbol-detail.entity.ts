import type { SymbolKind } from './symbol-info.entity.js';

export interface ReferencesSummary {
    readonly total: number;
    readonly byFile: Readonly<Record<string, readonly number[]>>;
}

export interface TypeHierarchy {
    readonly extends: readonly string[];
    readonly implements: readonly string[];
}

/**
 * Extended symbol information returned by the /inspect endpoint.
 * Fields are optional — only fields listed in the `include` parameter are populated.
 */
export interface SymbolDetail {
    readonly symbol: string;
    readonly kind: SymbolKind;
    readonly signature?: string | null | undefined;
    readonly doc?: string | null | undefined;
    readonly body?: string | null | undefined;
    readonly bodyLines?: readonly [number, number] | undefined;
    readonly referencesSummary?: ReferencesSummary | undefined;
    readonly typeHierarchy?: TypeHierarchy | null | undefined;
}
