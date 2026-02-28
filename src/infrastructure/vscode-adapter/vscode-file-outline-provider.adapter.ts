import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { FileOutlineProvider, FileOutlineOptions } from '../../application/ports/file-outline-provider.port.js';
import type { Result } from '../../shared/result.js';
import { Ok, Err } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { FileOutline, OutlineSymbol, ImportEntry } from '../../domain/entities/file-outline.entity.js';
import { VSCODE_KIND_MAP } from './adapter-utils.js';

export class VscodeFileOutlineProviderAdapter implements FileOutlineProvider {
    constructor(private readonly workspaceRoot: string) {}

    async getOutline(
        file: string,
        options: FileOutlineOptions,
    ): Promise<Result<FileOutline, AppError>> {
        const absPath = path.join(this.workspaceRoot, file);
        const uri = vscode.Uri.file(absPath);

        // Get document symbol tree
        let docSymbols: vscode.DocumentSymbol[];
        try {
            docSymbols =
                (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                    'vscode.executeDocumentSymbolProvider',
                    uri,
                )) ?? [];
        } catch (cause) {
            return Err({ kind: 'LSP_UNAVAILABLE', reason: String(cause) });
        }

        // Count lines and detect language id
        let lineCount = 0;
        let languageId = detectLanguage(file);
        const openDoc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === absPath);
        if (openDoc) {
            lineCount = openDoc.lineCount;
            languageId = openDoc.languageId;
        } else {
            try {
                const content = await fs.readFile(absPath, 'utf8');
                lineCount = content.split('\n').length;
            } catch {
                return Err({ kind: 'NOT_FOUND', entity: 'file', id: file });
            }
        }

        // Parse imports from file text
        let imports: ImportEntry[] = [];
        try {
            const text = openDoc?.getText() ?? (await fs.readFile(absPath, 'utf8'));
            imports = parseImports(text);
        } catch {
            imports = [];
        }

        // Convert DocumentSymbol tree to OutlineSymbol[]
        const symbols = docSymbols
            .map((s) => toOutlineSymbol(s, options, 1))
            .filter((s): s is OutlineSymbol => s !== null);

        return Ok({ file, language: languageId, lines: lineCount, imports, symbols });
    }
}

function toOutlineSymbol(
    sym: vscode.DocumentSymbol,
    options: FileOutlineOptions,
    depth: number,
): OutlineSymbol | null {
    const kind = VSCODE_KIND_MAP[sym.kind] ?? 'unknown';
    const children: OutlineSymbol[] =
        depth < options.depth
            ? sym.children
                  .map((c) => toOutlineSymbol(c, options, depth + 1))
                  .filter((c): c is OutlineSymbol => c !== null)
            : [];
    return {
        name: sym.name,
        kind,
        line: sym.selectionRange.start.line + 1,
        signature: options.includeSignatures ? (sym.detail || null) : null,
        exported: false, // conservative default without parsing source
        children,
    };
}

function detectLanguage(file: string): string {
    const ext = path.extname(file).slice(1).toLowerCase();
    const langMap: Record<string, string> = {
        ts: 'typescript', tsx: 'typescriptreact',
        js: 'javascript', jsx: 'javascriptreact',
        py: 'python', rs: 'rust', go: 'go',
        java: 'java', cs: 'csharp', cpp: 'cpp',
        c: 'c', rb: 'ruby', php: 'php',
    };
    return langMap[ext] ?? ext;
}

function parseImports(text: string): ImportEntry[] {
    const imports: ImportEntry[] = [];
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('import ')) continue;

        const fromMatch = /from\s+['"]([^'"]+)['"]/.exec(trimmed);
        if (!fromMatch) {
            // side-effect import: import 'module'
            const sideEffect = /import\s+['"]([^'"]+)['"]/.exec(trimmed);
            if (sideEffect?.[1]) imports.push({ module: sideEffect[1], names: [] });
            continue;
        }

        const module = fromMatch[1] ?? '';
        const names: string[] = [];

        // Named imports: { a, b as c, type d }
        const namedMatch = /\{([^}]+)\}/.exec(trimmed);
        if (namedMatch?.[1]) {
            names.push(
                ...namedMatch[1]
                    .split(',')
                    .map((n) => n.trim().replace(/\s+as\s+\w+/, '').replace(/^type\s+/, '').trim())
                    .filter(Boolean),
            );
        }

        // Default import: import Foo from '...'
        const defaultMatch = /^import\s+(?:type\s+)?([A-Za-z_$]\w*)\s/.exec(trimmed);
        if (defaultMatch?.[1] && defaultMatch[1] !== 'type') {
            names.unshift(defaultMatch[1]);
        }

        // Namespace import: * as ns
        const nsMatch = /\*\s+as\s+(\w+)/.exec(trimmed);
        if (nsMatch?.[1]) names.push(`* as ${nsMatch[1]}`);

        if (module) imports.push({ module, names });
    }
    return imports;
}
