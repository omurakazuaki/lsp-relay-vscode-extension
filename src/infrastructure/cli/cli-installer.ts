import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const CLI_LINK_DIR = path.join(os.homedir(), '.local', 'bin');
const CLI_LINK_PATH = path.join(CLI_LINK_DIR, 'semcode');

export function getCliJsPath(extensionPath: string): string {
    return path.join(extensionPath, 'out', 'cli.js');
}

/**
 * Creates a symlink at ~/.local/bin/semcode → <extensionPath>/out/cli.js.
 * Returns null on success, or an error message string on failure.
 */
export async function installCli(extensionPath: string): Promise<string | null> {
    const target = getCliJsPath(extensionPath);

    // Ensure ~/.local/bin exists
    try {
        await fs.mkdir(CLI_LINK_DIR, { recursive: true });
    } catch {
        return `Failed to create directory ${CLI_LINK_DIR}`;
    }

    // Check what already exists at the link path
    try {
        const stat = await fs.lstat(CLI_LINK_PATH);
        if (stat.isSymbolicLink()) {
            await fs.unlink(CLI_LINK_PATH);
        } else {
            return `${CLI_LINK_PATH} already exists and is not a symlink. Remove it manually first.`;
        }
    } catch {
        // Path does not exist — fine, proceed
    }

    // Create the symlink
    try {
        await fs.symlink(target, CLI_LINK_PATH);
    } catch (err) {
        return `Failed to create symlink: ${String(err)}`;
    }

    // Ensure the target is executable (best-effort)
    try {
        await fs.chmod(target, 0o755);
    } catch {
        // non-fatal
    }

    return null; // success
}

/**
 * Checks whether a symlink at ~/.local/bin/semcode points to a stale extension path.
 * If so, updates it to the current extensionPath. Called on every activation.
 *
 * Activation flow (per spec section 2.3):
 *   1. Check if ~/.local/bin/semcode exists
 *   2. If it is a symlink pointing to a different extensionPath → update it
 *   3. If it does not exist → do nothing (user has not opted in)
 */
export async function repairCliSymlink(extensionPath: string): Promise<void> {
    const newTarget = getCliJsPath(extensionPath);

    let currentTarget: string;
    try {
        const stat = await fs.lstat(CLI_LINK_PATH);
        if (!stat.isSymbolicLink()) return; // not a symlink — leave it alone
        currentTarget = await fs.readlink(CLI_LINK_PATH);
    } catch {
        return; // does not exist — user has not installed yet
    }

    if (currentTarget === newTarget) return; // already up to date

    // Stale symlink → atomically replace it
    try {
        await fs.unlink(CLI_LINK_PATH);
        await fs.symlink(newTarget, CLI_LINK_PATH);
        await fs.chmod(newTarget, 0o755).catch(() => undefined);
        console.log(`[LSP Relay] CLI symlink updated to ${newTarget}`);
    } catch (err) {
        // Non-fatal — the old symlink may be broken, but we shouldn't crash activation
        console.error(`[LSP Relay] Failed to repair CLI symlink: ${String(err)}`);
    }
}
