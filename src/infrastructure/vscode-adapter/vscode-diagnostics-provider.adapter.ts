import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { DiagnosticsProvider, DiagnosticsOptions } from '../../application/ports/diagnostics-provider.port.js';
import type { Result } from '../../shared/result.js';
import { Ok } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { DiagnosticItem, DiagnosticSeverity, FileDiagnostics } from '../../domain/entities/diagnostic.entity.js';

export class VscodeDiagnosticsProviderAdapter implements DiagnosticsProvider {
    constructor(private readonly workspaceRoot: string) {}

    async getDiagnostics(
        options: DiagnosticsOptions,
    ): Promise<Result<readonly FileDiagnostics[], AppError>> {
        const allDiags = vscode.languages.getDiagnostics();

        // Filter by file if specified
        const filtered = options.file
            ? allDiags.filter(([uri]) => {
                  const rel = path
                      .relative(this.workspaceRoot, uri.fsPath)
                      .replace(/\\/g, '/');
                  return rel === options.file;
              })
            : allDiags;

        const results: FileDiagnostics[] = [];

        for (const [uri, diagnostics] of filtered) {
            const relFile = path
                .relative(this.workspaceRoot, uri.fsPath)
                .replace(/\\/g, '/');

            // Get file content for context lines (best-effort)
            let fileLines: string[] = [];
            try {
                const openDoc = vscode.workspace.textDocuments.find(
                    (d) => d.uri.fsPath === uri.fsPath,
                );
                if (openDoc) {
                    fileLines = openDoc.getText().split('\n');
                } else {
                    const content = await fs.readFile(uri.fsPath, 'utf8');
                    fileLines = content.split('\n');
                }
            } catch {
                // context will be null
            }

            const items: DiagnosticItem[] = diagnostics
                .filter((d) => options.severity.includes(vscodeSeverityToString(d.severity)))
                .map((d) => ({
                    line: d.range.start.line + 1,
                    character: d.range.start.character,
                    severity: vscodeSeverityToString(d.severity),
                    message: d.message,
                    source: d.source ?? null,
                    code: typeof d.code === 'object' ? d.code.value : (d.code ?? null),
                    context: fileLines[d.range.start.line] ?? null,
                }));

            if (items.length > 0) {
                results.push({ file: relFile, diagnostics: items });
            }
        }

        return Ok(results);
    }
}

function vscodeSeverityToString(severity: vscode.DiagnosticSeverity): DiagnosticSeverity {
    switch (severity) {
        case vscode.DiagnosticSeverity.Error:
            return 'error';
        case vscode.DiagnosticSeverity.Warning:
            return 'warning';
        case vscode.DiagnosticSeverity.Information:
            return 'info';
        case vscode.DiagnosticSeverity.Hint:
            return 'hint';
    }
}
