import * as vscode from 'vscode';
import { LspRelayHttpServer } from './infrastructure/http-server/server.js';
import { SearchHandler } from './infrastructure/http-server/handlers/search.handler.js';
import { ReferencesHandler } from './infrastructure/http-server/handlers/references.handler.js';
import { FileOutlineHandler } from './infrastructure/http-server/handlers/file-outline.handler.js';
import { DiagnosticsHandler } from './infrastructure/http-server/handlers/diagnostics.handler.js';
import { SearchSymbolsUseCase } from './application/use-cases/search-symbols.use-case.js';
import { FindReferencesUseCase } from './application/use-cases/find-references.use-case.js';
import { GetFileOutlineUseCase } from './application/use-cases/get-file-outline.use-case.js';
import { GetDiagnosticsUseCase } from './application/use-cases/get-diagnostics.use-case.js';
import { VscodeSymbolSearcherAdapter } from './infrastructure/vscode-adapter/vscode-symbol-searcher.adapter.js';
import { VscodeReferenceProviderAdapter } from './infrastructure/vscode-adapter/vscode-reference-provider.adapter.js';
import { VscodeFileOutlineProviderAdapter } from './infrastructure/vscode-adapter/vscode-file-outline-provider.adapter.js';
import { VscodeDiagnosticsProviderAdapter } from './infrastructure/vscode-adapter/vscode-diagnostics-provider.adapter.js';
import { VscodeLspWarmupAdapter } from './infrastructure/vscode-adapter/vscode-lsp-warmup.adapter.js';
import { NodeTimerAdapter } from './infrastructure/vscode-adapter/node-timer.adapter.js';
import { writePortFile, removePortFile } from './port-discovery.js';
import { installSkill } from './infrastructure/lsp-resolve/skill-installer.js';
import type { Platform } from './infrastructure/lsp-resolve/skill-installer.js';

let httpServer: LspRelayHttpServer | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

    // --- Composition root ---------------------------------------------------
    // warmup is shared across all LSP-dependent adapters so that concurrent
    // requests only trigger a single warmup sequence (see LspWarmupPort contract).
    const warmup = new VscodeLspWarmupAdapter(new NodeTimerAdapter());
    const symbolSearcher = new VscodeSymbolSearcherAdapter(workspaceRoot, warmup);
    const referenceProvider = new VscodeReferenceProviderAdapter(workspaceRoot, warmup);
    const fileOutlineProvider = new VscodeFileOutlineProviderAdapter(workspaceRoot, warmup);
    const diagnosticsProvider = new VscodeDiagnosticsProviderAdapter(workspaceRoot);

    httpServer = new LspRelayHttpServer({
        search: new SearchHandler(new SearchSymbolsUseCase(symbolSearcher)),
        references: new ReferencesHandler(new FindReferencesUseCase(referenceProvider)),
        fileOutline: new FileOutlineHandler(new GetFileOutlineUseCase(fileOutlineProvider)),
        diagnostics: new DiagnosticsHandler(new GetDiagnosticsUseCase(diagnosticsProvider)),
    });
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

        context.subscriptions.push(
            vscode.commands.registerCommand('lsp-relay.installSkill', async () => {
                const picked = await vscode.window.showQuickPick(
                    [
                        { label: 'Claude Code', value: 'claude' as Platform },
                        { label: 'GitHub Copilot', value: 'copilot' as Platform },
                        { label: 'Both', value: 'all' },
                    ],
                    { placeHolder: 'Select target LLM platform' },
                );
                if (!picked) return;

                const platforms: Platform[] =
                    picked.value === 'all' ? ['claude', 'copilot'] : [picked.value as Platform];

                const result = await installSkill({
                    workspaceRoot,
                    platforms,
                    onConflict: async (p) => {
                        const ans = await vscode.window.showWarningMessage(
                            `${p} has been modified. Overwrite with bundled version?`,
                            'Overwrite',
                            'Skip',
                        );
                        return ans === 'Overwrite';
                    },
                });

                const msgs: string[] = [];
                if (result.installed.length > 0) {
                    msgs.push(`Installed: ${result.installed.join(', ')}`);
                }
                if (result.skipped.length > 0) {
                    msgs.push(`Skipped (up to date): ${result.skipped.join(', ')}`);
                }
                if (result.errors.length > 0) {
                    msgs.push(`Errors: ${result.errors.join('; ')}`);
                }
                void vscode.window.showInformationMessage(
                    `[SemCode Skills] ${msgs.join(' | ')}`,
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
