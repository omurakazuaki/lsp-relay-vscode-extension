import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const CLI_LINK_PATH = path.join(os.homedir(), '.local', 'bin', 'semcode');
const SKILL_DIR_NAME = 'semantic-search';
const SKILL_MD_FILENAME = 'SKILL.md';

export const PLATFORM_SKILL_DIRS = {
    claude: '.claude/skills',
    copilot: '.github/skills',
} as const;

export type Platform = keyof typeof PLATFORM_SKILL_DIRS;

/** Returns true if ~/.local/bin/semcode exists (i.e., CLI has been installed). */
export async function isCliInstalled(): Promise<boolean> {
    try {
        await fs.access(CLI_LINK_PATH);
        return true;
    } catch {
        return false;
    }
}

export interface InstallSkillOptions {
    readonly workspaceRoot: string;
    readonly platforms: readonly Platform[];
    /**
     * Called when SKILL.md already exists at the given path.
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
 * Installs SKILL.md and scripts/semcode symlink for the specified platforms.
 * Creates:
 *   <workspaceRoot>/.claude/skills/semantic-search/SKILL.md
 *   <workspaceRoot>/.claude/skills/semantic-search/scripts/semcode  -> ~/.local/bin/semcode
 *   (same for .github/skills/... when copilot is included)
 */
export async function installSkill(options: InstallSkillOptions): Promise<InstallSkillResult> {
    const installed: Platform[] = [];
    const skipped: Platform[] = [];
    const errors: string[] = [];

    for (const platform of options.platforms) {
        const baseDir = PLATFORM_SKILL_DIRS[platform];
        const skillDir = path.join(options.workspaceRoot, baseDir, SKILL_DIR_NAME);
        const skillMdPath = path.join(skillDir, 'SKILL.md');
        const scriptsDir = path.join(skillDir, 'scripts');
        const linkPath = path.join(scriptsDir, 'semcode');

        // Conflict check
        let skillMdExists = false;
        try {
            await fs.access(skillMdPath);
            skillMdExists = true;
        } catch {
            // doesn't exist — fine
        }

        if (skillMdExists) {
            const overwrite = await options.onConflict(skillMdPath);
            if (!overwrite) {
                skipped.push(platform);
                continue;
            }
        }

        // Create directory tree
        try {
            await fs.mkdir(scriptsDir, { recursive: true });
        } catch (err) {
            errors.push(`${platform}: failed to create directories: ${String(err)}`);
            continue;
        }

        // Write SKILL.md
        try {
            const content = await readSkillMdContent();
            await fs.writeFile(skillMdPath, content, 'utf8');
        } catch (err) {
            errors.push(`${platform}: failed to write SKILL.md: ${String(err)}`);
            continue;
        }

        // Create scripts/semcode → ~/.local/bin/semcode
        try {
            try {
                await fs.unlink(linkPath);
            } catch {
                // didn't exist — fine
            }
            await fs.symlink(CLI_LINK_PATH, linkPath);
        } catch (err) {
            errors.push(`${platform}: failed to create scripts/semcode symlink: ${String(err)}`);
            continue;
        }

        installed.push(platform);
    }

    return { installed, skipped, errors };
}
