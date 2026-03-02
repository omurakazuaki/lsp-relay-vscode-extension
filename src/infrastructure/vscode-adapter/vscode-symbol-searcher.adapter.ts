import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { SymbolSearcher } from '../../application/ports/symbol-searcher.port.js';
import type { LspWarmupPort } from '../../application/ports/lsp-warmup.port.js';
import type { Result } from '../../shared/result.js';
import { Ok, Err } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { SymbolInfo, SymbolKind } from '../../domain/entities/symbol-info.entity.js';
import type { SearchQuery } from '../../domain/value-objects/search-query.value-object.js';
import { VSCODE_KIND_MAP, findSymbolByNameAndLine, parseHover } from './adapter-utils.js';

/**
 * Adapter: implements SymbolSearcher using VS Code built-in commands.
 * Only the `vscode` module is imported here — never in domain/application.
 */
export class VscodeSymbolSearcherAdapter implements SymbolSearcher {
    constructor(
        private readonly workspaceRoot: string,
        private readonly warmup: LspWarmupPort,
    ) {}

    async search(query: SearchQuery): Promise<Result<SymbolInfo[], AppError>> {
        await this.warmup.ensureReady();

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

        if (mapped.length > 0 && (query.includeBody || query.includeHover)) {
            await enrichResults(mapped, this.workspaceRoot, query.includeBody, query.includeHover);
        }

        const results: SymbolInfo[] = mapped;
        return Ok(results);
    }
}

async function enrichResults(
    results: Array<{
        symbol: string;
        file: string;
        line: number;
        body: string | null;
        signature: string | null;
        doc: string | null;
        exported: boolean;
    }>,
    workspaceRoot: string,
    includeBody: boolean,
    includeHover: boolean,
): Promise<void> {
    // Group by file to minimise redundant VS Code API calls and file reads
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

        let fileLines: string[];
        try {
            const content = await fs.readFile(absPath, 'utf8');
            fileLines = content.split('\n');
        } catch {
            continue;
        }

        // Export detection: check the symbol's declaration line for the `export` keyword
        for (const result of fileResults) {
            const declarationLine = (fileLines[result.line - 1] ?? '').trimStart();
            result.exported = /^export\s/.test(declarationLine);
        }

        // Document symbols: required for body ranges, signature (detail), and hover position
        const uri = vscode.Uri.file(absPath);
        let docSymbols: vscode.DocumentSymbol[];
        try {
            docSymbols =
                (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                    'vscode.executeDocumentSymbolProvider',
                    uri,
                )) ?? [];
        } catch {
            continue; // graceful degradation
        }

        for (const result of fileResults) {
            // executeWorkspaceSymbolProvider appends "()" to functions; DocumentSymbol names do not.
            const lookupName = result.symbol.replace(/\(\)$/, '');
            const found = findSymbolByNameAndLine(docSymbols, lookupName, result.line - 1);
            if (!found) continue;

            // signature from DocumentSymbol.detail — zero extra API cost
            result.signature = found.detail || null;

            if (includeBody) {
                const startLine = found.range.start.line;
                const endLine = found.range.end.line;
                result.body = fileLines.slice(startLine, endLine + 1).join('\n');
            }

            if (includeHover) {
                try {
                    const hovers =
                        (await vscode.commands.executeCommand<vscode.Hover[]>(
                            'vscode.executeHoverProvider',
                            uri,
                            found.selectionRange.start,
                        )) ?? [];
                    const parsed = parseHover(hovers[0]);
                    // Hover signature is more accurate (resolves type aliases); prefer it over detail
                    if (parsed.signature) result.signature = parsed.signature;
                    result.doc = parsed.doc;
                } catch {
                    // graceful degradation: doc stays null
                }
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
