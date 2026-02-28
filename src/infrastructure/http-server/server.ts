import * as http from 'http';
import * as net from 'net';
import type { SearchHandler } from './handlers/search.handler.js';
import type { InspectHandler } from './handlers/inspect.handler.js';
import type { ReferencesHandler } from './handlers/references.handler.js';
import type { FileOutlineHandler } from './handlers/file-outline.handler.js';
import type { DiagnosticsHandler } from './handlers/diagnostics.handler.js';
import type { WorkspaceOverviewHandler } from './handlers/workspace-overview.handler.js';

export interface RouteHandlers {
    search: SearchHandler;
    inspect: InspectHandler;
    references: ReferencesHandler;
    fileOutline: FileOutlineHandler;
    diagnostics: DiagnosticsHandler;
    workspaceOverview: WorkspaceOverviewHandler;
}

/**
 * Minimal HTTP server that binds exclusively to 127.0.0.1.
 *
 * By default (preferredPort = 0) the OS assigns a random ephemeral port.
 * Pass a non-zero value to request a specific port — useful when callers
 * need a predictable URL (e.g. Claude Code HTTP hooks).
 *
 * If the preferred port is already in use the server falls back to a
 * random OS-assigned port and logs a warning so the operator knows.
 */
export class LspRelayHttpServer {
    private server: http.Server | null = null;
    private port = 0;

    constructor(private readonly handlers: RouteHandlers) {}

    start(preferredPort = 0): Promise<number> {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this.dispatch(req, res).catch((err: unknown) => {
                    console.error('[LSP Relay] Unhandled error:', err);
                    if (!res.headersSent) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Internal server error' }));
                    }
                });
            });

            const bindPort = (port: number, allowFallback: boolean) => {
                const onListening = () => {
                    this.server!.off('error', onError);
                    const addr = this.server!.address() as net.AddressInfo;
                    this.port = addr.port;
                    resolve(this.port);
                };
                const onError = (err: NodeJS.ErrnoException) => {
                    this.server!.off('listening', onListening);
                    if (err.code === 'EADDRINUSE' && allowFallback) {
                        console.warn(
                            `[LSP Relay] Port ${port} is already in use — falling back to a random port. ` +
                            `Update the semcode.port setting if you need a fixed URL for HTTP hooks.`,
                        );
                        bindPort(0, false);
                    } else {
                        reject(err);
                    }
                };
                this.server!.once('listening', onListening);
                this.server!.once('error', onError);
                this.server!.listen(port, '127.0.0.1');
            };

            bindPort(preferredPort, preferredPort !== 0);
        });
    }

    stop(): Promise<void> {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => resolve());
            } else {
                resolve();
            }
        });
    }

    getPort(): number {
        return this.port;
    }

    private async dispatch(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok', port: this.port }));
            return;
        }

        if (req.method !== 'POST') {
            res.writeHead(405);
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
        }

        let body: unknown;
        try {
            body = JSON.parse(await readBody(req));
        } catch {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            return;
        }

        const url = req.url ?? '';
        let response: { status: number; body: unknown };

        switch (url) {
            case '/search':
                response = await this.handlers.search.handle(body);
                break;
            case '/inspect':
                response = await this.handlers.inspect.handle(body);
                break;
            case '/references':
                response = await this.handlers.references.handle(body);
                break;
            case '/file_outline':
                response = await this.handlers.fileOutline.handle(body);
                break;
            case '/diagnostics':
                response = await this.handlers.diagnostics.handle(body);
                break;
            case '/workspace_overview':
                response = await this.handlers.workspaceOverview.handle(body);
                break;
            default:
                res.writeHead(404);
                res.end(JSON.stringify({ error: `Unknown endpoint: ${url}` }));
                return;
        }

        res.writeHead(response.status);
        res.end(JSON.stringify(response.body));
    }
}

function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}
