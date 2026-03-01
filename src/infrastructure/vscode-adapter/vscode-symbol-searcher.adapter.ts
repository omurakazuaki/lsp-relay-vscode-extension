import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { SymbolSearcher } from '../../application/ports/symbol-searcher.port.js';
import type { Result } from '../../shared/result.js';
import { Ok, Err } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { SymbolInfo, SymbolKind } from '../../domain/entities/symbol-info.entity.js';
import type { SearchQuery } from '../../domain/value-objects/search-query.value-object.js';
import { VSCODE_KIND_MAP, findSymbolByNameAndLine } from './adapter-utils.js';

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

        const mapped = raw
            .filter((s) => {
                if (!query.kinds) return true;
                const domainKind = VSCODE_KIND_MAP[s.kind] ?? 'unknown';
                return (query.kinds as ReadonlyArray<string>).includes(domainKind);
            })
            .map((s) => ({
                symbol: s.name,
                kind: (VSCODE_KIND_MAP[s.kind] ?? 'unknown') as SymbolKind,
                file: path.relative(this.workspaceRoot, s.location.uri.fsPath).replace(/\\/g, '/'),
                line: s.location.range.start.line + 1,
                container: s.containerName || null,
                signature: null as string | null,
                doc: null as string | null,
                exported: false,
                body: null as string | null,
                relevance: calculateRelevance(s.name, query.query),
            }));

        if (query.includeBody && mapped.length > 0) {
            await enrichBodies(mapped, this.workspaceRoot);
        }

        const results: SymbolInfo[] = mapped;
        return Ok(results);
    }
}

async function enrichBodies(
    results: Array<{ symbol: string; file: string; line: number; body: string | null }>,
    workspaceRoot: string,
): Promise<void> {
    // Group results by file to avoid redundant VS Code API calls and file reads
    const byFile = new Map<string, typeof results>();
    for (const r of results) {
        const existing = byFile.get(r.file);
        if (existing) {
            existing.push(r);
        } else {
            byFile.set(r.file, [r]);
        }
    }

    for (const [relFile, fileResults] of byFile) {
        const absPath = path.join(workspaceRoot, relFile);
        const uri = vscode.Uri.file(absPath);

        let docSymbols: vscode.DocumentSymbol[];
        try {
            docSymbols =
                (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                    'vscode.executeDocumentSymbolProvider',
                    uri,
                )) ?? [];
        } catch {
            continue; // graceful degradation: body stays null for this file
        }

        let fileLines: string[];
        try {
            const content = await fs.readFile(absPath, 'utf8');
            fileLines = content.split('\n');
        } catch {
            continue;
        }

        for (const result of fileResults) {
            const found = findSymbolByNameAndLine(docSymbols, result.symbol, result.line - 1);
            if (found) {
                const startLine = found.range.start.line;
                const endLine = found.range.end.line;
                result.body = fileLines.slice(startLine, endLine + 1).join('\n');
            }
        }
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
