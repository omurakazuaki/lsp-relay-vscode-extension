/**
 * Port: ensures the language server is ready to handle LSP commands
 * before the first real query is executed.
 *
 * Contract:
 * - ensureReady() is idempotent: calling it when already warm is a no-op.
 * - Concurrent calls before warm state is achieved must resolve from the
 *   same underlying Promise (deduplication). Only one warmup sequence ever runs.
 * - ensureReady() always resolves — never rejects. Warmup failure is best-effort;
 *   the actual LSP call proceeds regardless.
 */
export interface LspWarmupPort {
    ensureReady(): Promise<void>;
}
