import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import * as http from 'http';
import { PORT_FILE_PREFIX } from '../../shared/constants.js';

// ---------------------------------------------------------------------------
// Port discovery
// ---------------------------------------------------------------------------

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

async function readPortFile(workspaceRoot: string): Promise<PortInfo> {
    const filePath = portFilePath(workspaceRoot);
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as PortInfo;
}

function resolveWorkspaceRoot(option: string | undefined): string {
    return option ? path.resolve(option) : process.cwd();
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

function postJson(port: number, endpoint: string, body: unknown, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const req = http.request(
            {
                hostname: '127.0.0.1',
                port,
                path: endpoint,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                },
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');
                    try {
                        const parsed = JSON.parse(text) as unknown;
                        if (res.statusCode && res.statusCode >= 400) {
                            const err = parsed && typeof parsed === 'object' && 'error' in parsed
                                ? String((parsed as { error: unknown }).error)
                                : `HTTP ${res.statusCode}`;
                            reject(new Error(err));
                        } else {
                            resolve(parsed);
                        }
                    } catch {
                        reject(new Error(`Invalid JSON response: ${text}`));
                    }
                });
            },
        );
        req.setTimeout(timeoutMs, () => {
            req.destroy();
            reject(new Error(`Request timed out after ${timeoutMs}ms`));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function getJson(port: number, endpoint: string, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const req = http.request(
            { hostname: '127.0.0.1', port, path: endpoint, method: 'GET' },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');
                    try {
                        resolve(JSON.parse(text));
                    } catch {
                        reject(new Error(`Invalid JSON response: ${text}`));
                    }
                });
            },
        );
        req.setTimeout(timeoutMs, () => {
            req.destroy();
            reject(new Error(`Request timed out after ${timeoutMs}ms`));
        });
        req.on('error', reject);
        req.end();
    });
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function output(data: unknown, format: string): void {
    if (format === 'pretty') {
        process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    } else {
        process.stdout.write(JSON.stringify(data) + '\n');
    }
}

function fatal(message: string): never {
    process.stderr.write(`Error: ${message}\n`);
    process.exit(2);
}

// ---------------------------------------------------------------------------
// Main program
// ---------------------------------------------------------------------------

const program = new Command();

program
    .name('semcode')
    .description('Semantic code search CLI — talks to the SemCode VS Code extension')
    .version('0.1.0')
    .option('-w, --workspace <path>', 'Workspace root (default: cwd)')
    .option('--format <fmt>', 'Output format: json | pretty', 'json')
    .option('--timeout <ms>', 'Request timeout in ms', '10000');

program
    .command('search <query>')
    .description('Search for symbols across the workspace')
    .option('--kinds <kinds>', 'Comma-separated symbol kinds (function,class,...)')
    .option('--scope <scope>', 'Search scope: workspace|file|directory', 'workspace')
    .option('--path <path>', 'File or directory path (required for file/directory scope)')
    .option('--limit <n>', 'Max results', '15')
    .option('--include-body', 'Include source code bodies')
    .action(async (query: string, opts: { kinds?: string; scope: string; path?: string; limit: string; includeBody?: boolean }) => {
        const parent = program.opts<{ workspace?: string; format: string; timeout: string }>();
        const workspaceRoot = resolveWorkspaceRoot(parent.workspace);
        const timeoutMs = parseInt(parent.timeout, 10);
        let port: number;
        try {
            const info = await readPortFile(workspaceRoot);
            port = info.port;
        } catch {
            fatal('Could not read port file. Is the VS Code extension running?');
        }
        const body: Record<string, unknown> = {
            query,
            scope: opts.scope,
            limit: parseInt(opts.limit, 10),
        };
        if (opts.kinds) body['kinds'] = opts.kinds.split(',').map((k) => k.trim());
        if (opts.path) body['path'] = opts.path;
        if (opts.includeBody) body['include_body'] = true;
        try {
            const result = await postJson(port, '/search', body, timeoutMs);
            output(result, parent.format);
        } catch (err) {
            fatal(String(err));
        }
    });

program
    .command('inspect <location>')
    .description('Inspect a symbol at file:line (e.g., src/foo.ts:42)')
    .option('--include <fields>', 'Comma-separated fields: signature,doc,body,references_summary,type_hierarchy')
    .option('--character <n>', 'Character offset (0-based)', '0')
    .action(async (location: string, opts: { include?: string; character: string }) => {
        const parent = program.opts<{ workspace?: string; format: string; timeout: string }>();
        const workspaceRoot = resolveWorkspaceRoot(parent.workspace);
        const timeoutMs = parseInt(parent.timeout, 10);
        const match = /^(.+):(\d+)$/.exec(location);
        if (!match) fatal('location must be in the format file:line (e.g., src/foo.ts:42)');
        const [, file, lineStr] = match;
        const body: Record<string, unknown> = {
            file,
            line: parseInt(lineStr!, 10),
            character: parseInt(opts.character, 10),
        };
        if (opts.include) body['include'] = opts.include.split(',').map((f) => f.trim());
        let port: number;
        try {
            port = (await readPortFile(workspaceRoot)).port;
        } catch {
            fatal('Could not read port file. Is the VS Code extension running?');
        }
        try {
            output(await postJson(port, '/inspect', body, timeoutMs), parent.format);
        } catch (err) {
            fatal(String(err));
        }
    });

program
    .command('refs <location>')
    .description('Find all references to a symbol at file:line')
    .option('--context-lines <n>', 'Context lines around each reference', '2')
    .option('--limit <n>', 'Max references', '30')
    .action(async (location: string, opts: { contextLines: string; limit: string }) => {
        const parent = program.opts<{ workspace?: string; format: string; timeout: string }>();
        const workspaceRoot = resolveWorkspaceRoot(parent.workspace);
        const timeoutMs = parseInt(parent.timeout, 10);
        const match = /^(.+):(\d+)$/.exec(location);
        if (!match) fatal('location must be in the format file:line');
        const [, file, lineStr] = match;
        const body = {
            file,
            line: parseInt(lineStr!, 10),
            context_lines: parseInt(opts.contextLines, 10),
            limit: parseInt(opts.limit, 10),
        };
        let port: number;
        try {
            port = (await readPortFile(workspaceRoot)).port;
        } catch {
            fatal('Could not read port file. Is the VS Code extension running?');
        }
        try {
            output(await postJson(port, '/references', body, timeoutMs), parent.format);
        } catch (err) {
            fatal(String(err));
        }
    });

program
    .command('outline <file>')
    .description('Get the structural outline of a file')
    .option('--depth <n>', 'Nesting depth', '2')
    .option('--no-signatures', 'Exclude function/method signatures')
    .action(async (file: string, opts: { depth: string; signatures: boolean }) => {
        const parent = program.opts<{ workspace?: string; format: string; timeout: string }>();
        const workspaceRoot = resolveWorkspaceRoot(parent.workspace);
        const timeoutMs = parseInt(parent.timeout, 10);
        const body = {
            file,
            depth: parseInt(opts.depth, 10),
            include_signatures: opts.signatures,
        };
        let port: number;
        try {
            port = (await readPortFile(workspaceRoot)).port;
        } catch {
            fatal('Could not read port file. Is the VS Code extension running?');
        }
        try {
            output(await postJson(port, '/file_outline', body, timeoutMs), parent.format);
        } catch (err) {
            fatal(String(err));
        }
    });

program
    .command('diagnostics [file]')
    .description('Get errors and warnings (omit file for entire workspace)')
    .option('--severity <levels>', 'Comma-separated: error,warning,info', 'error,warning')
    .action(async (file: string | undefined, opts: { severity: string }) => {
        const parent = program.opts<{ workspace?: string; format: string; timeout: string }>();
        const workspaceRoot = resolveWorkspaceRoot(parent.workspace);
        const timeoutMs = parseInt(parent.timeout, 10);
        const body: Record<string, unknown> = {
            severity: opts.severity.split(',').map((s) => s.trim()),
        };
        if (file) body['file'] = file;
        let port: number;
        try {
            port = (await readPortFile(workspaceRoot)).port;
        } catch {
            fatal('Could not read port file. Is the VS Code extension running?');
        }
        try {
            output(await postJson(port, '/diagnostics', body, timeoutMs), parent.format);
        } catch (err) {
            fatal(String(err));
        }
    });

program
    .command('overview')
    .description('Get a high-level workspace summary')
    .option('--depth <n>', 'Directory tree depth', '2')
    .option('--no-stats', 'Exclude language statistics')
    .action(async (opts: { depth: string; stats: boolean }) => {
        const parent = program.opts<{ workspace?: string; format: string; timeout: string }>();
        const workspaceRoot = resolveWorkspaceRoot(parent.workspace);
        const timeoutMs = parseInt(parent.timeout, 10);
        const body = { depth: parseInt(opts.depth, 10), include_stats: opts.stats };
        let port: number;
        try {
            port = (await readPortFile(workspaceRoot)).port;
        } catch {
            fatal('Could not read port file. Is the VS Code extension running?');
        }
        try {
            output(await postJson(port, '/workspace_overview', body, timeoutMs), parent.format);
        } catch (err) {
            fatal(String(err));
        }
    });

program
    .command('status')
    .description('Check if the VS Code extension is running and reachable')
    .action(async () => {
        const parent = program.opts<{ workspace?: string; format: string; timeout: string }>();
        const workspaceRoot = resolveWorkspaceRoot(parent.workspace);
        const timeoutMs = parseInt(parent.timeout, 10);
        let portInfo: PortInfo;
        try {
            portInfo = await readPortFile(workspaceRoot);
        } catch {
            output({ status: 'offline', reason: 'port file not found' }, parent.format);
            process.exit(2);
        }
        try {
            const health = await getJson(portInfo.port, '/health', timeoutMs);
            output({ status: 'online', port: portInfo.port, pid: portInfo.pid, health }, parent.format);
        } catch (err) {
            output({
                status: 'unreachable',
                port: portInfo.port,
                pid: portInfo.pid,
                reason: String(err),
            }, parent.format);
            process.exit(2);
        }
    });

program.parse(process.argv);
