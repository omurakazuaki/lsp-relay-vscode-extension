import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { ReferenceProvider, ReferenceProviderResult } from '../../application/ports/reference-provider.port.js';
import type { Result } from '../../shared/result.js';
import { Ok, Err } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { SymbolLocation } from '../../domain/value-objects/symbol-location.value-object.js';
import { extractContext, parseHover } from './adapter-utils.js';

export class VscodeReferenceProviderAdapter implements ReferenceProvider {
    constructor(private readonly workspaceRoot: string) {}

    async findReferences(
        location: SymbolLocation,
        options: { readonly contextLines: number; readonly limit: number },
    ): Promise<Result<ReferenceProviderResult, AppError>> {
        const absPath = path.join(this.workspaceRoot, location.file);
        const uri = vscode.Uri.file(absPath);
        const pos = new vscode.Position(location.line - 1, location.character);

        // Get symbol name via hover (best-effort)
        let symbolName = `${location.file}:${location.line}`;
        try {
            const hovers =
                (await vscode.commands.executeCommand<vscode.Hover[]>(
                    'vscode.executeHoverProvider',
                    uri,
                    pos,
                )) ?? [];
            const parsed = parseHover(hovers[0]);
            if (parsed.signature) {
                const match = /\b(\w+)\s*[(:=<]/.exec(parsed.signature);
                if (match?.[1]) symbolName = match[1];
            }
        } catch {
            // use fallback name
        }

        // Find references
        let refs: vscode.Location[];
        try {
            refs =
                (await vscode.commands.executeCommand<vscode.Location[]>(
                    'vscode.executeReferenceProvider',
                    uri,
                    pos,
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
