import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { FileOutlineProvider, FileOutlineOptions } from '../../application/ports/file-outline-provider.port.js';
import type { Result } from '../../shared/result.js';
import { Ok, Err } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { FileOutline, OutlineSymbol, ImportEntry } from '../../domain/entities/file-outline.entity.js';
import { VSCODE_KIND_MAP, parseHover } from './adapter-utils.js';

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

        // Read file text once — used for import parsing and export detection
        let text = '';
        try {
            text = openDoc?.getText() ?? (await fs.readFile(absPath, 'utf8'));
        } catch {
            // text stays empty; imports and export detection degrade gracefully
        }
        const imports = parseImports(text);

        // Build set of 0-based line indices where the `export` keyword appears
        const exportedLineSet = new Set<number>();
        for (const [i, line] of text.split('\n').entries()) {
            if (/^export\s/.test((line ?? '').trimStart())) {
                exportedLineSet.add(i);
            }
        }

        // Convert DocumentSymbol tree to OutlineSymbol[]
        const symbols = (
            await Promise.all(docSymbols.map((s) => toOutlineSymbol(s, options, uri, 1, exportedLineSet)))
        ).filter((s): s is OutlineSymbol => s !== null);

        return Ok({ file, language: languageId, lines: lineCount, imports, symbols });
    }
}

// Symbol kinds that meaningfully contain other named symbols (class members, enum
// variants, etc.). Function/method bodies are excluded so local variables inside
// them are never surfaced as outline children.
const CONTAINER_SYMBOL_KINDS = new Set([
    vscode.SymbolKind.Class,
    vscode.SymbolKind.Module,
    vscode.SymbolKind.Namespace,
    vscode.SymbolKind.Package,
    vscode.SymbolKind.Interface,
    vscode.SymbolKind.Enum,
    vscode.SymbolKind.Struct,
    vscode.SymbolKind.Object,
]);

async function toOutlineSymbol(
    sym: vscode.DocumentSymbol,
    options: FileOutlineOptions,
    uri: vscode.Uri,
    depth: number,
    exportedLines: ReadonlySet<number>,
): Promise<OutlineSymbol | null> {
    const kind = VSCODE_KIND_MAP[sym.kind] ?? 'unknown';

    // Only recurse into container types (class, interface, enum, …).
    // Function/method bodies are not recursed so local variables are hidden.
    const children: OutlineSymbol[] =
        depth < options.depth && CONTAINER_SYMBOL_KINDS.has(sym.kind)
            ? (
                  await Promise.all(
                      sym.children.map((c) => toOutlineSymbol(c, options, uri, depth + 1, exportedLines)),
                  )
              ).filter((c): c is OutlineSymbol => c !== null)
            : [];

    let signature: string | null = null;
    if (options.includeSignatures) {
        // sym.detail is populated by some language servers (Go, Java) but is
        // typically empty for TypeScript. Fall back to the hover provider which
        // always returns the resolved type signature.
        signature = sym.detail || null;
        if (!signature) {
            try {
                const hovers =
                    (await vscode.commands.executeCommand<vscode.Hover[]>(
                        'vscode.executeHoverProvider',
                        uri,
                        sym.selectionRange.start,
                    )) ?? [];
                signature = parseHover(hovers[0]).signature;
            } catch {
                // graceful degradation — signature remains null
            }
        }
    }

    return {
        name: sym.name,
        kind,
        line: sym.selectionRange.start.line + 1,
        signature,
        exported: exportedLines.has(sym.range.start.line),
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
