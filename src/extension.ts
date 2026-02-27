import * as vscode from 'vscode';
import { LspRelayHttpServer } from './infrastructure/http-server/server.js';
import { SearchHandler } from './infrastructure/http-server/handlers/search.handler.js';
import { SearchSymbolsUseCase } from './application/use-cases/search-symbols.use-case.js';
import { VscodeSymbolSearcherAdapter } from './infrastructure/vscode-adapter/vscode-symbol-searcher.adapter.js';
import { writePortFile, removePortFile } from './port-discovery.js';

let httpServer: LspRelayHttpServer | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

    // --- Composition root ---------------------------------------------------
    const symbolSearcher = new VscodeSymbolSearcherAdapter(workspaceRoot);
    const searchUseCase = new SearchSymbolsUseCase(symbolSearcher);
    const searchHandler = new SearchHandler(searchUseCase);

    httpServer = new LspRelayHttpServer({ search: searchHandler });
    // ------------------------------------------------------------------------

    try {
        const port = await httpServer.start();
        await writePortFile(workspaceRoot, port);

        console.log(`[LSP Relay] Listening on http://127.0.0.1:${port}`);
        vscode.window.setStatusBarMessage(`LSP Relay: port ${port}`, 5000);

        context.subscriptions.push({
            dispose: async () => {
                await httpServer?.stop();
                await removePortFile(workspaceRoot);
                httpServer = null;
            },
        });

        context.subscriptions.push(
            vscode.commands.registerCommand('lsp-relay.showStatus', () => {
                void vscode.window.showInformationMessage(
                    `LSP Relay is running on http://127.0.0.1:${port}`,
                );
            }),
        );
    } catch (err) {
        void vscode.window.showErrorMessage(`[LSP Relay] Failed to start: ${String(err)}`);
        console.error('[LSP Relay] Startup error:', err);
    }
}

export async function deactivate(): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    await httpServer?.stop();
    await removePortFile(workspaceRoot);
    httpServer = null;
}
