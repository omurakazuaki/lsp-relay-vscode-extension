/**
 * Port: abstraction over time-based delays.
 * Required per CLAUDE.md: setTimeout/setInterval must be injected, never used raw.
 * Implementations live in infrastructure/vscode-adapter/.
 */
export interface TimerPort {
    /**
     * Resolves after the given number of milliseconds.
     * In tests, implementations can resolve immediately to avoid real delays.
     */
    sleep(ms: number): Promise<void>;
}
