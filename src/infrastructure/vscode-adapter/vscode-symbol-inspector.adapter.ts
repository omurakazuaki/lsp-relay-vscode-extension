import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { SymbolInspector, InspectField } from '../../application/ports/symbol-inspector.port.js';
import type { Result } from '../../shared/result.js';
import { Ok, Err } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { SymbolDetail, ReferencesSummary, TypeHierarchy } from '../../domain/entities/symbol-detail.entity.js';
import type { SymbolKind } from '../../domain/entities/symbol-info.entity.js';
import type { SymbolLocation } from '../../domain/value-objects/symbol-location.value-object.js';
import { VSCODE_KIND_MAP, parseHover, findSymbolByLine } from './adapter-utils.js';

export class VscodeSymbolInspectorAdapter implements SymbolInspector {
    constructor(private readonly workspaceRoot: string) {}

    async inspect(
        location: SymbolLocation,
        include: ReadonlyArray<InspectField>,
    ): Promise<Result<SymbolDetail, AppError>> {
        const absPath = path.join(this.workspaceRoot, location.file);
        const uri = vscode.Uri.file(absPath);

        // -- Document symbols: name, kind, body --
        // Find by line only (not character) so indented symbols (constructors,
        // methods, etc.) are correctly resolved even when character defaults to 0.
        let symbolName = `${location.file}:${location.line}`;
        let symbolKind: SymbolKind = 'unknown';
        let body: string | null = null;
        let bodyLines: readonly [number, number] | undefined;
        let hoverPos = new vscode.Position(location.line - 1, location.character);

        try {
            const docSymbols =
                (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                    'vscode.executeDocumentSymbolProvider',
                    uri,
                )) ?? [];
            const found = findSymbolByLine(docSymbols, location.line - 1);
            if (!found) {
                return Err({
                    kind: 'NOT_FOUND',
                    entity: 'symbol',
                    id: `${location.file}:${location.line}`,
                });
            }
            symbolName = found.name;
            symbolKind = VSCODE_KIND_MAP[found.kind] ?? 'unknown';
            // Use the symbol's own selection-range start for hover so that the
            // language server receives a position that is guaranteed to be on
            // the identifier token, regardless of the caller's character offset.
            hoverPos = found.selectionRange.start;

            if (include.includes('body')) {
                const startLine = found.range.start.line;
                const endLine = found.range.end.line;
                bodyLines = [startLine + 1, endLine + 1];
                try {
                    const content = await fs.readFile(absPath, 'utf8');
                    const fileLines = content.split('\n');
                    body = fileLines.slice(startLine, endLine + 1).join('\n');
                } catch {
                    body = null;
                }
            }
        } catch (cause) {
            return Err({ kind: 'LSP_UNAVAILABLE', reason: String(cause) });
        }

        // -- Hover: signature + doc --
        // Called after symbol lookup so we can use selectionRange.start.
        let signature: string | null = null;
        let doc: string | null = null;
        if (include.includes('signature') || include.includes('doc')) {
            try {
                const hovers =
                    (await vscode.commands.executeCommand<vscode.Hover[]>(
                        'vscode.executeHoverProvider',
                        uri,
                        hoverPos,
                    )) ?? [];
                const parsed = parseHover(hovers[0]);
                signature = parsed.signature;
                doc = parsed.doc;
            } catch {
                // graceful degradation — signature/doc remain null
            }
        }

        // -- References summary --
        let referencesSummary: ReferencesSummary | undefined;
        if (include.includes('references_summary')) {
            try {
                const refs =
                    (await vscode.commands.executeCommand<vscode.Location[]>(
                        'vscode.executeReferenceProvider',
                        uri,
                        hoverPos,
                    )) ?? [];
                const byFile: Record<string, number[]> = {};
                for (const ref of refs) {
                    const relFile = path
                        .relative(this.workspaceRoot, ref.uri.fsPath)
                        .replace(/\\/g, '/');
                    const lineNum = ref.range.start.line + 1;
                    const arr = byFile[relFile];
                    if (arr) {
                        arr.push(lineNum);
                    } else {
                        byFile[relFile] = [lineNum];
                    }
                }
                referencesSummary = { total: refs.length, byFile };
            } catch {
                referencesSummary = { total: 0, byFile: {} };
            }
        }

        // -- Type hierarchy --
        let typeHierarchy: TypeHierarchy | null | undefined;
        if (include.includes('type_hierarchy')) {
            try {
                const items =
                    (await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
                        'vscode.prepareTypeHierarchy',
                        uri,
                        hoverPos,
                    )) ?? [];
                const item = items[0];
                if (item) {
                    const supertypes =
                        (await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
                            'vscode.provideSupertypes',
                            item,
                        )) ?? [];
                    typeHierarchy = {
                        extends: supertypes
                            .filter((i) => i.kind === vscode.SymbolKind.Class)
                            .map((i) => i.name),
                        implements: supertypes
                            .filter((i) => i.kind === vscode.SymbolKind.Interface)
                            .map((i) => i.name),
                    };
                } else {
                    typeHierarchy = null;
                }
            } catch {
                typeHierarchy = null;
            }
        }

        const detail: SymbolDetail = {
            symbol: symbolName,
            kind: symbolKind,
            signature: include.includes('signature') ? signature : undefined,
            doc: include.includes('doc') ? doc : undefined,
            body: include.includes('body') ? body : undefined,
            bodyLines: include.includes('body') ? bodyLines : undefined,
            referencesSummary: include.includes('references_summary') ? referencesSummary : undefined,
            typeHierarchy: include.includes('type_hierarchy') ? typeHierarchy : undefined,
        };

        return Ok(detail);
    }
}
