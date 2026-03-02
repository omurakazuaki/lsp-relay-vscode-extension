import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TimerPort } from '../../application/ports/timer.port.js';

vi.mock('vscode', () => ({
    workspace: {
        findFiles: vi.fn(),
        openTextDocument: vi.fn(),
    },
    commands: {
        executeCommand: vi.fn(),
    },
}));

import * as vscode from 'vscode';
import { VscodeLspWarmupAdapter } from './vscode-lsp-warmup.adapter.js';

// ---- helpers ---------------------------------------------------------------

function makeTimer(overrides: Partial<TimerPort> = {}): TimerPort {
    return {
        sleep: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

function makeUri(fsPath: string): vscode.Uri {
    return { fsPath } as unknown as vscode.Uri;
}

/** Stubs for the two probe commands */
const DOC_SYMBOL_CMD = 'vscode.executeDocumentSymbolProvider';
const WS_SYMBOL_CMD = 'vscode.executeWorkspaceSymbolProvider';

/** Non-empty document symbol result — indicates LSP has analyzed the file. */
function docReady(): vscode.DocumentSymbol[] {
    return [{ name: 'TestSymbol' } as unknown as vscode.DocumentSymbol];
}

/** Non-empty workspace symbol result — indicates workspace index is complete. */
function wsReady(): vscode.SymbolInformation[] {
    return [{ name: 'TestSymbol' } as unknown as vscode.SymbolInformation];
}

/** Empty array: returned by both commands before LSP has finished. */
const notReady: never[] = [];

/**
 * Creates a mock for vscode.commands.executeCommand that routes to per-command handlers.
 * Each handler is a function that returns a new value per call (use .mockReturnValueOnce chains
 * by passing arrays; the last element is repeated for all subsequent calls).
 */
function mockCommandSequences(sequences: {
    doc: (vscode.DocumentSymbol[] | undefined)[];
    ws: (vscode.SymbolInformation[] | undefined)[];
}): void {
    let docIdx = 0;
    let wsIdx = 0;
    vi.mocked(vscode.commands.executeCommand).mockImplementation(
        async (command: unknown) => {
            if (command === DOC_SYMBOL_CMD) {
                const val = sequences.doc[Math.min(docIdx, sequences.doc.length - 1)];
                docIdx++;
                return val;
            }
            if (command === WS_SYMBOL_CMD) {
                const val = sequences.ws[Math.min(wsIdx, sequences.ws.length - 1)];
                wsIdx++;
                return val;
            }
            return undefined;
        },
    );
}

// ---- tests -----------------------------------------------------------------

describe('VscodeLspWarmupAdapter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should complete warmup on first probe when both phases respond immediately', async () => {
        // Arrange: both phases respond on the first attempt
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue([makeUri('/ws/src/index.ts')]);
        vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({} as vscode.TextDocument);
        mockCommandSequences({ doc: [docReady()], ws: [wsReady()] });

        const timer = makeTimer();
        const adapter = new VscodeLspWarmupAdapter(timer);

        // Act
        await adapter.ensureReady();

        // Assert: file was opened, both probes were called, no sleeping
        expect(vscode.workspace.openTextDocument).toHaveBeenCalledOnce();
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(DOC_SYMBOL_CMD, expect.anything());
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(WS_SYMBOL_CMD, 'TestSymbol');
        expect(timer.sleep).not.toHaveBeenCalled();
    });

    it('should poll Phase 1 (document symbols) until file is analyzed', async () => {
        // Arrange: doc probe returns [] twice then succeeds; ws succeeds on first try
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue([makeUri('/ws/src/index.ts')]);
        vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({} as vscode.TextDocument);
        mockCommandSequences({
            doc: [notReady, notReady, docReady()],
            ws: [wsReady()],
        });

        const timer = makeTimer();
        const adapter = new VscodeLspWarmupAdapter(timer);

        await adapter.ensureReady();

        // 2 sleeps for Phase 1 failures, 0 for Phase 2
        expect(timer.sleep).toHaveBeenCalledTimes(2);
    });

    it('should poll Phase 2 (workspace index) until workspace is indexed', async () => {
        // Arrange: doc succeeds first try; ws returns [] twice then succeeds
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue([makeUri('/ws/src/index.ts')]);
        vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({} as vscode.TextDocument);
        mockCommandSequences({
            doc: [docReady()],
            ws: [notReady, notReady, wsReady()],
        });

        const timer = makeTimer();
        const adapter = new VscodeLspWarmupAdapter(timer);

        await adapter.ensureReady();

        // 0 sleeps for Phase 1, 2 sleeps for Phase 2
        expect(timer.sleep).toHaveBeenCalledTimes(2);
    });

    it('should mark warm after timeout if Phase 1 never completes', async () => {
        // Arrange: doc always returns []; Date.now() jumps past deadline
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue([makeUri('/ws/src/index.ts')]);
        vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({} as vscode.TextDocument);
        mockCommandSequences({ doc: [notReady], ws: [] });

        let callCount = 0;
        vi.spyOn(Date, 'now').mockImplementation(() => (callCount++ === 0 ? 1_000_000 : 2_000_000));

        const timer = makeTimer();
        const adapter = new VscodeLspWarmupAdapter(timer);

        await expect(adapter.ensureReady()).resolves.toBeUndefined();

        vi.spyOn(Date, 'now').mockRestore();
        vi.clearAllMocks();
        await adapter.ensureReady();
        expect(vscode.workspace.findFiles).not.toHaveBeenCalled();
    });

    it('should mark warm after timeout if Phase 2 never completes', async () => {
        // Arrange: doc succeeds; ws always returns []; Date.now() jumps after Phase 1
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue([makeUri('/ws/src/index.ts')]);
        vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({} as vscode.TextDocument);
        mockCommandSequences({ doc: [docReady()], ws: [notReady] });

        // 1st call = Phase 1 deadline start; 2nd (Phase 1 while check) = still valid;
        // after Phase 1 succeeds, first Phase 2 while check jumps past deadline
        let callCount = 0;
        vi.spyOn(Date, 'now').mockImplementation(() => {
            const t = [1_000_000, 1_000_001, 2_000_000];
            return t[Math.min(callCount++, t.length - 1)] ?? 2_000_000;
        });

        const timer = makeTimer();
        const adapter = new VscodeLspWarmupAdapter(timer);

        await expect(adapter.ensureReady()).resolves.toBeUndefined();

        vi.spyOn(Date, 'now').mockRestore();
    });

    it('should be idempotent — second call skips all VS Code APIs', async () => {
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue([makeUri('/ws/src/index.ts')]);
        vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({} as vscode.TextDocument);
        mockCommandSequences({ doc: [docReady()], ws: [wsReady()] });

        const timer = makeTimer();
        const adapter = new VscodeLspWarmupAdapter(timer);

        await adapter.ensureReady();
        vi.clearAllMocks();

        await adapter.ensureReady();

        expect(vscode.workspace.findFiles).not.toHaveBeenCalled();
        expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('should deduplicate concurrent calls — warmup runs exactly once', async () => {
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue([makeUri('/ws/src/index.ts')]);
        vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({} as vscode.TextDocument);
        mockCommandSequences({ doc: [docReady()], ws: [wsReady()] });

        const timer = makeTimer();
        const adapter = new VscodeLspWarmupAdapter(timer);

        await Promise.all([adapter.ensureReady(), adapter.ensureReady(), adapter.ensureReady()]);

        expect(vscode.workspace.openTextDocument).toHaveBeenCalledOnce();
    });

    it('should resolve without probing when no source files exist', async () => {
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue([]);

        const timer = makeTimer();
        const adapter = new VscodeLspWarmupAdapter(timer);

        await adapter.ensureReady();

        expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
        expect(timer.sleep).not.toHaveBeenCalled();

        vi.clearAllMocks();
        await adapter.ensureReady();
        expect(vscode.workspace.findFiles).not.toHaveBeenCalled();
    });

    it('should continue probing even if openTextDocument throws', async () => {
        vi.mocked(vscode.workspace.findFiles).mockResolvedValue([makeUri('/ws/src/index.ts')]);
        vi.mocked(vscode.workspace.openTextDocument).mockRejectedValue(new Error('locked'));
        mockCommandSequences({ doc: [docReady()], ws: [wsReady()] });

        const timer = makeTimer();
        const adapter = new VscodeLspWarmupAdapter(timer);

        await expect(adapter.ensureReady()).resolves.toBeUndefined();
    });
});
