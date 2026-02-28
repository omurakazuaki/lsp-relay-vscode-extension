import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const SEMCODE_DIR = path.join(os.homedir(), '.semcode', 'ports');

interface PortInfo {
    port: number;
    pid: number;
    workspaceFolders: string[];
    timestamp: number;
}

/**
 * Derives port file path from workspace root.
 * Layout: ~/.semcode/ports/<workspace-absolute-path>/port.json
 *
 * Example: workspace /home/user/project
 *       → ~/.semcode/ports/home/user/project/port.json
 *
 * This avoids the need for hash computation (no md5sum / platform differences).
 */
function portFilePath(workspaceRoot: string): string {
    // Strip leading slash so path.join works correctly (e.g. "/home/user" → "home/user")
    const relative = (workspaceRoot || 'default').replace(/^\//, '');
    return path.join(SEMCODE_DIR, relative, 'port.json');
}

export async function writePortFile(workspaceRoot: string, port: number): Promise<void> {
    const filePath = portFilePath(workspaceRoot);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const info: PortInfo = {
        port,
        pid: process.pid,
        workspaceFolders: workspaceRoot ? [workspaceRoot] : [],
        timestamp: Date.now(),
    };
    await fs.writeFile(filePath, JSON.stringify(info, null, 2), 'utf8');
}

export async function removePortFile(workspaceRoot: string): Promise<void> {
    try {
        await fs.unlink(portFilePath(workspaceRoot));
    } catch {
        // File may already be gone — not an error
    }
}
