export interface LanguageStat {
    readonly files: number;
    readonly lines: number;
}

export interface WorkspaceInfo {
    readonly name: string;
    readonly root: string;
    readonly languages: Readonly<Record<string, LanguageStat>>;
    readonly structure: readonly string[];
    readonly entryPoints: readonly string[];
    readonly activeDiagnostics: {
        readonly errors: number;
        readonly warnings: number;
    };
}
