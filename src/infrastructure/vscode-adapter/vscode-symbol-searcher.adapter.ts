import * as vscode from 'vscode';
import * as path from 'path';
import type { SymbolSearcher } from '../../application/ports/symbol-searcher.port.js';
import type { Result } from '../../shared/result.js';
import { Ok, Err } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { SymbolInfo, SymbolKind } from '../../domain/entities/symbol-info.entity.js';
import type { SearchQuery } from '../../domain/value-objects/search-query.value-object.js';

/** Maps vscode.SymbolKind numeric values to domain SymbolKind strings. */
const VSCODE_KIND_MAP: Readonly<Record<number, SymbolKind>> = {
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

/**
 * Adapter: implements SymbolSearcher using VS Code built-in commands.
 * Only the `vscode` module is imported here — never in domain/application.
 */
export class VscodeSymbolSearcherAdapter implements SymbolSearcher {
    constructor(private readonly workspaceRoot: string) {}

    async search(query: SearchQuery): Promise<Result<SymbolInfo[], AppError>> {
        if (query.scope !== 'workspace') {
            // File/directory scope is deferred to a future implementation
            return Err({ kind: 'INTERNAL', message: `Scope "${query.scope}" not yet implemented` });
        }

        let raw: vscode.SymbolInformation[];
        try {
            raw =
                (await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                    'vscode.executeWorkspaceSymbolProvider',
                    query.query,
                )) ?? [];
        } catch (cause) {
            return Err({ kind: 'LSP_UNAVAILABLE', reason: String(cause) });
        }

        const results = raw
            .filter((s) => {
                if (!query.kinds) return true;
                const domainKind = VSCODE_KIND_MAP[s.kind] ?? 'unknown';
                return (query.kinds as ReadonlyArray<string>).includes(domainKind);
            })
            .map((s): SymbolInfo => ({
                symbol: s.name,
                kind: VSCODE_KIND_MAP[s.kind] ?? 'unknown',
                file: path.relative(this.workspaceRoot, s.location.uri.fsPath).replace(/\\/g, '/'),
                line: s.location.range.start.line + 1,
                container: s.containerName || null,
                signature: null, // enriched on demand by the handler
                doc: null,
                exported: false,
                body: null,
                relevance: calculateRelevance(s.name, query.query),
            }));

        return Ok(results);
    }
}

function calculateRelevance(name: string, query: string): number {
    const n = name.toLowerCase();
    const q = query.toLowerCase().trim();
    if (!q) return 0.5;
    if (n === q) return 1.0;
    if (n.startsWith(q)) return 0.9;
    if (n.includes(q)) return 0.75;
    const words = q.split(/\s+/).filter(Boolean);
    const matched = words.filter((w) => n.includes(w)).length;
    return words.length > 0 ? (matched / words.length) * 0.6 : 0.3;
}
