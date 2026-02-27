import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { PORT_FILE_PREFIX } from './shared/constants.js';

interface PortInfo {
    port: number;
    pid: number;
    workspaceFolders: string[];
    timestamp: number;
}

function portFilePath(workspaceRoot: string): string {
    const hash = crypto
        .createHash('md5')
        .update(workspaceRoot || 'default')
        .digest('hex')
        .slice(0, 8);
    return path.join(os.tmpdir(), `${PORT_FILE_PREFIX}-${hash}.json`);
}

export async function writePortFile(workspaceRoot: string, port: number): Promise<void> {
    const info: PortInfo = {
        port,
        pid: process.pid,
        workspaceFolders: workspaceRoot ? [workspaceRoot] : [],
        timestamp: Date.now(),
    };
    await fs.writeFile(portFilePath(workspaceRoot), JSON.stringify(info, null, 2), 'utf8');
}

export async function removePortFile(workspaceRoot: string): Promise<void> {
    try {
        await fs.unlink(portFilePath(workspaceRoot));
    } catch {
        // File may already be gone — not an error
    }
}
