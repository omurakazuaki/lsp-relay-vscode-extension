import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import * as path from 'path';

const SKILL_DIR_NAME = 'lsp-resolve';
const SKILL_MD_FILENAME = 'SKILL.md';

export const PLATFORM_SKILL_DIRS = {
    claude: '.claude/skills',
    copilot: '.github/skills',
} as const;

export type Platform = keyof typeof PLATFORM_SKILL_DIRS;

function sha256(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export interface InstallSkillOptions {
    readonly workspaceRoot: string;
    readonly platforms: readonly Platform[];
    /**
     * Called when SKILL.md already exists and its content differs from the bundled version.
     * Return true to overwrite, false to skip this platform.
     */
    readonly onConflict: (skillMdPath: string) => Promise<boolean>;
}

export interface InstallSkillResult {
    readonly installed: readonly Platform[];
    readonly skipped: readonly Platform[];
    readonly errors: readonly string[];
}

/** Reads SKILL.md template from the same directory as the bundled output. */
async function readSkillMdContent(): Promise<string> {
    const skillMdPath = path.join(__dirname, SKILL_MD_FILENAME);
    return fs.readFile(skillMdPath, 'utf8');
}

/**
 * Installs SKILL.md for the specified platforms.
 * Creates:
 *   <workspaceRoot>/.claude/skills/lsp-resolve/SKILL.md
 *   (same for .github/skills/... when copilot is included)
 *
 * Uses SHA-256 hash comparison to detect whether an existing SKILL.md
 * matches the bundled version. If hashes match, the platform is skipped
 * (already up to date). If they differ, onConflict is called.
 */
export async function installSkill(options: InstallSkillOptions): Promise<InstallSkillResult> {
    const installed: Platform[] = [];
    const skipped: Platform[] = [];
    const errors: string[] = [];

    let bundledContent: string;
    try {
        bundledContent = await readSkillMdContent();
    } catch (err) {
        return { installed, skipped, errors: [`Failed to read bundled SKILL.md: ${String(err)}`] };
    }
    const bundledHash = sha256(bundledContent);

    for (const platform of options.platforms) {
        const baseDir = PLATFORM_SKILL_DIRS[platform];
        const skillDir = path.join(options.workspaceRoot, baseDir, SKILL_DIR_NAME);
        const skillMdPath = path.join(skillDir, 'SKILL.md');

        // Check existing SKILL.md and compare hash
        let existingContent: string | null = null;
        try {
            existingContent = await fs.readFile(skillMdPath, 'utf8');
        } catch {
            // doesn't exist — fresh install
        }

        if (existingContent !== null) {
            if (sha256(existingContent) === bundledHash) {
                skipped.push(platform);
                continue;
            }
            const overwrite = await options.onConflict(skillMdPath);
            if (!overwrite) {
                skipped.push(platform);
                continue;
            }
        }

        // Create directory
        try {
            await fs.mkdir(skillDir, { recursive: true });
        } catch (err) {
            errors.push(`${platform}: failed to create directories: ${String(err)}`);
            continue;
        }

        // Write SKILL.md
        try {
            await fs.writeFile(skillMdPath, bundledContent, 'utf8');
        } catch (err) {
            errors.push(`${platform}: failed to write SKILL.md: ${String(err)}`);
            continue;
        }

        installed.push(platform);
    }

    return { installed, skipped, errors };
}
