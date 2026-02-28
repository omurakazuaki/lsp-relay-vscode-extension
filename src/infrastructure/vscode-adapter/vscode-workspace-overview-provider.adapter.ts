import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { WorkspaceOverviewProvider, WorkspaceOverviewOptions } from '../../application/ports/workspace-overview-provider.port.js';
import type { Result } from '../../shared/result.js';
import { Ok, Err } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { WorkspaceInfo, LanguageStat } from '../../domain/entities/workspace-info.entity.js';

const EXT_TO_LANG: Readonly<Record<string, string>> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    py: 'python', rs: 'rust', go: 'go',
    java: 'java', cs: 'csharp', cpp: 'cpp', cc: 'cpp',
    c: 'c', rb: 'ruby', php: 'php', swift: 'swift',
    json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown',
    toml: 'toml', html: 'html', css: 'css', scss: 'scss',
};

const IGNORED_DIRS = new Set(['node_modules', 'out', 'dist', '.git', '.cache', 'coverage']);

export class VscodeWorkspaceOverviewProviderAdapter implements WorkspaceOverviewProvider {
    constructor(private readonly workspaceRoot: string) {}

    async getOverview(options: WorkspaceOverviewOptions): Promise<Result<WorkspaceInfo, AppError>> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return Err({ kind: 'LSP_UNAVAILABLE', reason: 'No workspace folder open' });
        }

        const folder = folders[0]!;
        const name = folder.name;
        const root = folder.uri.fsPath;

        // Build directory structure
        const structure: string[] = [];
        try {
            await buildStructure(root, options.depth, 0, structure);
        } catch {
            // best-effort
        }

        // Language statistics
        const languages: Record<string, LanguageStat> = {};
        if (options.includeStats) {
            try {
                await collectLanguageStats(root, languages);
            } catch {
                // best-effort
            }
        }

        // Entry points from package.json
        const entryPoints: string[] = [];
        try {
            const pkgText = await fs.readFile(path.join(root, 'package.json'), 'utf8');
            const pkg = JSON.parse(pkgText) as Record<string, unknown>;
            for (const field of ['main', 'module'] as const) {
                if (typeof pkg[field] === 'string') entryPoints.push(pkg[field] as string);
            }
            const bin = pkg['bin'];
            if (typeof bin === 'string') {
                entryPoints.push(bin);
            } else if (bin && typeof bin === 'object') {
                entryPoints.push(...Object.values(bin as Record<string, unknown>).filter((v): v is string => typeof v === 'string'));
            }
        } catch {
            // no package.json or unreadable
        }

        // Active diagnostic counts
        const allDiags = vscode.languages.getDiagnostics();
        let errors = 0;
        let warnings = 0;
        for (const [, diags] of allDiags) {
            for (const d of diags) {
                if (d.severity === vscode.DiagnosticSeverity.Error) errors++;
                else if (d.severity === vscode.DiagnosticSeverity.Warning) warnings++;
            }
        }

        return Ok({
            name,
            root,
            languages,
            structure,
            entryPoints,
            activeDiagnostics: { errors, warnings },
        });
    }
}

async function buildStructure(
    dir: string,
    maxDepth: number,
    currentDepth: number,
    result: string[],
): Promise<void> {
    if (currentDepth >= maxDepth) return;

    let entries: { name: string; isDirectory: boolean }[];
    try {
        const dirents = await fs.readdir(dir, { withFileTypes: true });
        entries = dirents
            .filter((d) => !(d.name.startsWith('.') || IGNORED_DIRS.has(d.name)))
            .map((d) => ({ name: d.name, isDirectory: d.isDirectory() }))
            .sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
    } catch {
        return;
    }

    const indent = '  '.repeat(currentDepth);
    for (const entry of entries) {
        if (entry.isDirectory) {
            result.push(`${indent}${entry.name}/`);
            await buildStructure(
                path.join(dir, entry.name),
                maxDepth,
                currentDepth + 1,
                result,
            );
        } else {
            result.push(`${indent}${entry.name}`);
        }
    }
}

async function collectLanguageStats(
    dir: string,
    stats: Record<string, LanguageStat>,
): Promise<void> {
    let entries: { name: string; isDirectory: boolean }[];
    try {
        const dirents = await fs.readdir(dir, { withFileTypes: true });
        entries = dirents
            .filter((d) => !(d.name.startsWith('.') || IGNORED_DIRS.has(d.name)))
            .map((d) => ({ name: d.name, isDirectory: d.isDirectory() }));
    } catch {
        return;
    }

    await Promise.all(
        entries.map(async (entry) => {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory) {
                await collectLanguageStats(fullPath, stats);
            } else {
                const ext = path.extname(entry.name).slice(1).toLowerCase();
                const lang = EXT_TO_LANG[ext];
                if (!lang) return;
                try {
                    const content = await fs.readFile(fullPath, 'utf8');
                    const lines = content.split('\n').length;
                    const existing = stats[lang];
                    if (existing) {
                        stats[lang] = { files: existing.files + 1, lines: existing.lines + lines };
                    } else {
                        stats[lang] = { files: 1, lines };
                    }
                } catch {
                    // skip unreadable file
                }
            }
        }),
    );
}
