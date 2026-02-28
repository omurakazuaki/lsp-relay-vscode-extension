import type { SymbolKind } from './symbol-info.entity.js';

export interface ImportEntry {
    readonly module: string;
    readonly names: readonly string[];
}

export interface OutlineSymbol {
    readonly name: string;
    readonly kind: SymbolKind;
    readonly line: number;          // 1-based
    readonly signature: string | null;
    readonly exported: boolean;
    readonly children: readonly OutlineSymbol[];
}

export interface FileOutline {
    readonly file: string;      // relative path from workspace root
    readonly language: string;
    readonly lines: number;
    readonly imports: readonly ImportEntry[];
    readonly symbols: readonly OutlineSymbol[];
}
