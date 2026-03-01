import * as vscode from 'vscode';
import { LspRelayHttpServer } from './infrastructure/http-server/server.js';
import { SearchHandler } from './infrastructure/http-server/handlers/search.handler.js';
import { InspectHandler } from './infrastructure/http-server/handlers/inspect.handler.js';
import { ReferencesHandler } from './infrastructure/http-server/handlers/references.handler.js';
import { FileOutlineHandler } from './infrastructure/http-server/handlers/file-outline.handler.js';
import { DiagnosticsHandler } from './infrastructure/http-server/handlers/diagnostics.handler.js';
import { WorkspaceOverviewHandler } from './infrastructure/http-server/handlers/workspace-overview.handler.js';
import { SearchSymbolsUseCase } from './application/use-cases/search-symbols.use-case.js';
import { InspectSymbolUseCase } from './application/use-cases/inspect-symbol.use-case.js';
import { FindReferencesUseCase } from './application/use-cases/find-references.use-case.js';
import { GetFileOutlineUseCase } from './application/use-cases/get-file-outline.use-case.js';
import { GetDiagnosticsUseCase } from './application/use-cases/get-diagnostics.use-case.js';
import { GetWorkspaceOverviewUseCase } from './application/use-cases/get-workspace-overview.use-case.js';
import { VscodeSymbolSearcherAdapter } from './infrastructure/vscode-adapter/vscode-symbol-searcher.adapter.js';
import { VscodeSymbolInspectorAdapter } from './infrastructure/vscode-adapter/vscode-symbol-inspector.adapter.js';
import { VscodeReferenceProviderAdapter } from './infrastructure/vscode-adapter/vscode-reference-provider.adapter.js';
import { VscodeFileOutlineProviderAdapter } from './infrastructure/vscode-adapter/vscode-file-outline-provider.adapter.js';
import { VscodeDiagnosticsProviderAdapter } from './infrastructure/vscode-adapter/vscode-diagnostics-provider.adapter.js';
import { VscodeWorkspaceOverviewProviderAdapter } from './infrastructure/vscode-adapter/vscode-workspace-overview-provider.adapter.js';
import { writePortFile, removePortFile } from './port-discovery.js';
import { installSkill } from './infrastructure/lsp-resolve/skill-installer.js';
import type { Platform } from './infrastructure/lsp-resolve/skill-installer.js';

let httpServer: LspRelayHttpServer | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

    // --- Composition root ---------------------------------------------------
    const symbolSearcher = new VscodeSymbolSearcherAdapter(workspaceRoot);
    const symbolInspector = new VscodeSymbolInspectorAdapter(workspaceRoot);
    const referenceProvider = new VscodeReferenceProviderAdapter(workspaceRoot);
    const fileOutlineProvider = new VscodeFileOutlineProviderAdapter(workspaceRoot);
    const diagnosticsProvider = new VscodeDiagnosticsProviderAdapter(workspaceRoot);
    const workspaceOverviewProvider = new VscodeWorkspaceOverviewProviderAdapter(workspaceRoot);

    httpServer = new LspRelayHttpServer({
        search: new SearchHandler(new SearchSymbolsUseCase(symbolSearcher)),
        inspect: new InspectHandler(new InspectSymbolUseCase(symbolInspector)),
        references: new ReferencesHandler(new FindReferencesUseCase(referenceProvider)),
        fileOutline: new FileOutlineHandler(new GetFileOutlineUseCase(fileOutlineProvider)),
        diagnostics: new DiagnosticsHandler(new GetDiagnosticsUseCase(diagnosticsProvider)),
        workspaceOverview: new WorkspaceOverviewHandler(new GetWorkspaceOverviewUseCase(workspaceOverviewProvider)),
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
