import { z } from 'zod';
import type { GetWorkspaceOverviewUseCase } from '../../../application/use-cases/get-workspace-overview.use-case.js';
import { type HttpResponse, appErrorToStatus, describeError } from './handler-utils.js';

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
