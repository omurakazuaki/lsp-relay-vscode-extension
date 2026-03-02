import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { ReferenceProvider, ReferenceProviderResult } from '../../application/ports/reference-provider.port.js';
import type { Result } from '../../shared/result.js';
import { Ok, Err } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { SymbolLocation } from '../../domain/value-objects/symbol-location.value-object.js';
import { extractContext, findSymbolByLine } from './adapter-utils.js';

export class VscodeReferenceProviderAdapter implements ReferenceProvider {
    constructor(private readonly workspaceRoot: string) {}

    async findReferences(
        location: SymbolLocation,
        options: { readonly contextLines: number; readonly limit: number },
    ): Promise<Result<ReferenceProviderResult, AppError>> {
        const absPath = path.join(this.workspaceRoot, location.file);
        const uri = vscode.Uri.file(absPath);

        // Resolve the target symbol and use its selectionRange.start as the
        // reference position. This ensures indented symbols (methods, constructors)
        // are correctly targeted even when the caller passes character=0.
        let symbolName = `${location.file}:${location.line}`;
        let refPos = new vscode.Position(location.line - 1, location.character);
        try {
            const docSymbols =
                (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                    'vscode.executeDocumentSymbolProvider',
                    uri,
                )) ?? [];
            const found = findSymbolByLine(docSymbols, location.line - 1);
            if (found) {
                symbolName = found.name;
                refPos = found.selectionRange.start;
            }
        } catch {
            // use fallback name and position
        }

        // Find references
        let refs: vscode.Location[];
        try {
            refs =
                (await vscode.commands.executeCommand<vscode.Location[]>(
                    'vscode.executeReferenceProvider',
                    uri,
                    refPos,
                )) ?? [];
        } catch (cause) {
            return Err({ kind: 'LSP_UNAVAILABLE', reason: String(cause) });
        }

        const total = refs.length;
        const limited = refs.slice(0, options.limit);

        // Read file lines for context (cached per file path)
        const fileContentsCache = new Map<string, string[]>();
        const getLines = async (filePath: string): Promise<string[]> => {
            const cached = fileContentsCache.get(filePath);
            if (cached) return cached;
            try {
                const content = await fs.readFile(filePath, 'utf8');
                const lines = content.split('\n');
                fileContentsCache.set(filePath, lines);
                return lines;
            } catch {
                return [];
            }
        };

        const references = await Promise.all(
            limited.map(async (ref) => {
                const refAbsPath = ref.uri.fsPath;
                const relFile = path
                    .relative(this.workspaceRoot, refAbsPath)
                    .replace(/\\/g, '/');
                const lineIndex = ref.range.start.line;
                const lines = await getLines(refAbsPath);
                const context = extractContext(lines, lineIndex, options.contextLines);
                return { file: relFile, line: lineIndex + 1, context };
            }),
        );

        return Ok({ symbol: symbolName, total, references });
    }
}
