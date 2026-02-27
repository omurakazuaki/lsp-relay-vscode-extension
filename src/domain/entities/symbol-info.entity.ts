export type SymbolKind =
    | 'function'
    | 'class'
    | 'interface'
    | 'type'
    | 'variable'
    | 'constant'
    | 'method'
    | 'property'
    | 'field'
    | 'enum'
    | 'enum_member'
    | 'constructor'
    | 'namespace'
    | 'module'
    | 'struct'
    | 'unknown';

/** A code symbol returned by a workspace/document symbol search. Immutable. */
export interface SymbolInfo {
    readonly symbol: string;
    readonly kind: SymbolKind;
    readonly file: string;    // relative path from workspace root
    readonly line: number;    // 1-based
    readonly container: string | null;
    readonly signature: string | null;
    readonly doc: string | null;
    readonly exported: boolean;
    readonly body: string | null;
    readonly relevance: number; // 0.0 – 1.0
}
