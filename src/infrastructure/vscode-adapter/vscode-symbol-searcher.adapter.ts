import * as vscode from 'vscode';
import * as path from 'path';
import type { SymbolSearcher } from '../../application/ports/symbol-searcher.port.js';
import type { Result } from '../../shared/result.js';
import { Ok, Err } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { SymbolInfo } from '../../domain/entities/symbol-info.entity.js';
import type { SearchQuery } from '../../domain/value-objects/search-query.value-object.js';
import { VSCODE_KIND_MAP } from './adapter-utils.js';

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
