import * as vscode from 'vscode';
import type { LspWarmupPort } from '../../application/ports/lsp-warmup.port.js';
import type { TimerPort } from '../../application/ports/timer.port.js';

const SOURCE_PATTERN = '**/*.{ts,tsx,js,jsx,mts,mjs,py,rs,go,java,cs}';
const SOURCE_EXCLUDE = '{**/node_modules/**,**/*.d.ts,**/dist/**,**/out/**}';
const WARMUP_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;

/**
 * Adapter: triggers LSP server startup on demand by silently opening a source
 * file via vscode.workspace.openTextDocument (no editor tab is shown).
 *
 * VS Code language servers use activation events (e.g. onLanguage:typescript)
 * that only fire when a document of the matching language is opened. This adapter
 * fires that event on the first call to ensureReady(), then polls until the
 * document symbol provider responds, indicating the LSP is ready to serve requests.
 *
 * After the first successful warmup, all subsequent calls are no-ops (isWarm=true).
 * Concurrent calls before warmup completes share a single Promise (no duplicate warmup).
 */
export class VscodeLspWarmupAdapter implements LspWarmupPort {
    private isWarm = false;
    private warmingPromise: Promise<void> | null = null;

    constructor(private readonly timer: TimerPort) {}

    ensureReady(): Promise<void> {
        // Fast path: already warm.
        if (this.isWarm) return Promise.resolve();

        // Deduplication: concurrent callers await the same Promise.
        if (this.warmingPromise !== null) return this.warmingPromise;

        this.warmingPromise = this.runWarmup().finally(() => {
            this.warmingPromise = null;
        });

        return this.warmingPromise;
    }

    private async runWarmup(): Promise<void> {
        // Step 1: Find a source file to open.
        const files = await vscode.workspace.findFiles(SOURCE_PATTERN, SOURCE_EXCLUDE, 1);

        if (files.length === 0) {
            // No source files in workspace — cannot trigger LSP activation.
            // Mark warm so we don't block future requests.
            this.isWarm = true;
            return;
        }

        const fileUri = files[0]!;

        // Step 2: Open the document in memory (no editor tab shown).
        // This fires onDidOpenTextDocument which triggers onLanguage:* activation events,
        // causing the appropriate language server to start.
        try {
            await vscode.workspace.openTextDocument(fileUri);
        } catch {
            // If opening fails, proceed anyway — the poll below may still succeed
            // if another mechanism already started the language server.
        }

        // Two-phase probe: document-level → workspace-level.
        //
        // Phase 1: Wait for the opened file to be analyzed (document symbols).
        //   executeDocumentSymbolProvider returns [] before LSP indexes the file.
        //   Once it returns a non-empty array, we have a symbol name to use in Phase 2.
        //
        // Phase 2: Wait for the workspace index to include that symbol.
        //   executeWorkspaceSymbolProvider returns [] while workspace indexing is in progress
        //   even though document-level analysis is already done for individual files.
        //   Only when it returns the symbol do we know workspace search is ready.
        const deadline = Date.now() + WARMUP_TIMEOUT_MS;

        // Phase 1
        let symbolName: string | null = null;
        while (Date.now() < deadline) {
            symbolName = await this.probeDocumentSymbol(fileUri);
            if (symbolName !== null) break;
            await this.timer.sleep(POLL_INTERVAL_MS);
        }

        if (symbolName === null) {
            // Document-level LSP never came up within the timeout.
            this.isWarm = true;
            return;
        }

        // Phase 2
        while (Date.now() < deadline) {
            if (await this.probeWorkspaceSymbol(symbolName)) {
                this.isWarm = true;
                return;
            }
            await this.timer.sleep(POLL_INTERVAL_MS);
        }

        // Timeout: mark warm to avoid blocking subsequent requests indefinitely.
        this.isWarm = true;
    }

    private async probeDocumentSymbol(uri: vscode.Uri): Promise<string | null> {
        // Returns the first symbol name when LSP has analyzed the file, null otherwise.
        try {
            const result = await vscode.commands.executeCommand<
                vscode.DocumentSymbol[] | undefined
            >('vscode.executeDocumentSymbolProvider', uri);
            if (Array.isArray(result) && result.length > 0) {
                return result[0]!.name;
            }
            return null;
        } catch {
            return null;
        }
    }

    private async probeWorkspaceSymbol(symbolName: string): Promise<boolean> {
        // Returns true when the workspace symbol index includes the given symbol name.
        try {
            const result = await vscode.commands.executeCommand<
                vscode.SymbolInformation[] | undefined
            >('vscode.executeWorkspaceSymbolProvider', symbolName);
            return Array.isArray(result) && result.length > 0;
        } catch {
            return false;
        }
    }
}
