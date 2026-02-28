import { z } from 'zod';
import type { GetWorkspaceOverviewUseCase } from '../../../application/use-cases/get-workspace-overview.use-case.js';
import type { AppError } from '../../../domain/errors/app-error.js';
import type { HttpResponse } from './search.handler.js';

const WorkspaceOverviewRequestSchema = z.object({
    depth: z.number().int().positive().optional(),
    include_stats: z.boolean().optional(),
});

export class WorkspaceOverviewHandler {
    constructor(private readonly useCase: GetWorkspaceOverviewUseCase) {}

    async handle(rawBody: unknown): Promise<HttpResponse> {
        const parsed = WorkspaceOverviewRequestSchema.safeParse(rawBody);
        if (!parsed.success) {
            return { status: 400, body: { error: parsed.error.issues[0]?.message ?? 'Invalid request' } };
        }
        const data = parsed.data;

        const result = await this.useCase.execute({
            depth: data.depth,
            includeStats: data.include_stats,
        });
        if (!result.ok) {
            return { status: appErrorToStatus(result.error), body: { error: describeError(result.error) } };
        }

        const info = result.value;
        return {
            status: 200,
            body: {
                name: info.name,
                root: info.root,
                languages: info.languages,
                structure: info.structure,
                entry_points: info.entryPoints,
                active_diagnostics: info.activeDiagnostics,
            },
        };
    }
}

function appErrorToStatus(err: AppError): number {
    switch (err.kind) {
        case 'VALIDATION': return 400;
        case 'NOT_FOUND': return 404;
        case 'TIMEOUT': return 408;
        case 'LSP_UNAVAILABLE': return 503;
        case 'INTERNAL': return 500;
    }
}

function describeError(err: AppError): string {
    switch (err.kind) {
        case 'VALIDATION': return err.message;
        case 'NOT_FOUND': return `${err.entity} not found: ${err.id}`;
        case 'TIMEOUT': return `Operation timed out: ${err.operation}`;
        case 'LSP_UNAVAILABLE': return `Language server unavailable: ${err.reason}`;
        case 'INTERNAL': return err.message;
    }
}
