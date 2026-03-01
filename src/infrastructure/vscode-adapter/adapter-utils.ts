import * as vscode from 'vscode';
import type { SymbolKind } from '../../domain/entities/symbol-info.entity.js';

/** Maps vscode.SymbolKind numeric values to domain SymbolKind strings. */
export const VSCODE_KIND_MAP: Readonly<Record<number, SymbolKind>> = {
    [vscode.SymbolKind.File]: 'unknown',
    [vscode.SymbolKind.Module]: 'module',
    [vscode.SymbolKind.Namespace]: 'namespace',
    [vscode.SymbolKind.Package]: 'module',
    [vscode.SymbolKind.Class]: 'class',
    [vscode.SymbolKind.Method]: 'method',
    [vscode.SymbolKind.Property]: 'property',
    [vscode.SymbolKind.Field]: 'field',
    [vscode.SymbolKind.Constructor]: 'constructor',
    [vscode.SymbolKind.Enum]: 'enum',
    [vscode.SymbolKind.Interface]: 'interface',
    [vscode.SymbolKind.Function]: 'function',
    [vscode.SymbolKind.Variable]: 'variable',
    [vscode.SymbolKind.Constant]: 'constant',
    [vscode.SymbolKind.String]: 'unknown',
    [vscode.SymbolKind.Number]: 'unknown',
    [vscode.SymbolKind.Boolean]: 'unknown',
    [vscode.SymbolKind.Array]: 'unknown',
    [vscode.SymbolKind.Object]: 'unknown',
    [vscode.SymbolKind.Key]: 'unknown',
    [vscode.SymbolKind.Null]: 'unknown',
    [vscode.SymbolKind.EnumMember]: 'enum_member',
    [vscode.SymbolKind.Struct]: 'struct',
    [vscode.SymbolKind.Event]: 'unknown',
    [vscode.SymbolKind.Operator]: 'unknown',
    [vscode.SymbolKind.TypeParameter]: 'type',
};

/** Parse the first hover item into signature and doc strings. */
export function parseHover(hover: vscode.Hover | undefined): { signature: string | null; doc: string | null } {
    if (!hover || hover.contents.length === 0) {
        return { signature: null, doc: null };
    }

    const parts: string[] = hover.contents
        .map((c) => {
            if (typeof c === 'string') return c;
            return c.value;
        })
        .filter(Boolean);

    // First part is typically the signature (often wrapped in a code block)
    const rawSig = parts[0] ?? null;
    const signature = rawSig ? stripCodeBlock(rawSig) : null;

    // Remaining parts are the documentation
    const docParts = parts.slice(1).join('\n\n');
    const doc = docParts.trim() || null;

    return { signature, doc };
}

function stripCodeBlock(text: string): string {
    const match = /^```\w*\n([\s\S]+)\n```$/.exec(text.trim());
    return match ? (match[1] ?? text).trim() : text.trim();
}

/** Find the deepest DocumentSymbol containing a position (DFS). */
export function findSymbolAtPosition(
    symbols: vscode.DocumentSymbol[],
    position: vscode.Position,
): vscode.DocumentSymbol | null {
    for (const sym of symbols) {
        if (sym.range.contains(position)) {
            const child = findSymbolAtPosition(sym.children, position);
            return child ?? sym;
        }
    }
    return null;
}

/** Find a DocumentSymbol by name, preferring the one closest to a given 0-based line. DFS. */
export function findSymbolByNameAndLine(
    symbols: vscode.DocumentSymbol[],
    name: string,
    line: number,
): vscode.DocumentSymbol | null {
    let best: vscode.DocumentSymbol | null = null;
    let bestDist = Infinity;

    function walk(syms: vscode.DocumentSymbol[]): void {
        for (const sym of syms) {
            if (sym.name === name) {
                const dist = Math.abs(sym.selectionRange.start.line - line);
                if (dist < bestDist) {
                    best = sym;
                    bestDist = dist;
                }
            }
            walk(sym.children);
        }
    }

    walk(symbols);
    return best;
}

/** Get surrounding context lines for a 0-based line index. */
export function extractContext(lines: string[], lineIndex: number, contextLines: number): string {
    const start = Math.max(0, lineIndex - contextLines);
    const end = Math.min(lines.length - 1, lineIndex + contextLines);
    return lines.slice(start, end + 1).join('\n');
}
