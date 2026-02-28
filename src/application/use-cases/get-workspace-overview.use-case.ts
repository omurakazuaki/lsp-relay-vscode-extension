import type { Result } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { WorkspaceInfo } from '../../domain/entities/workspace-info.entity.js';
import type { WorkspaceOverviewProvider } from '../ports/workspace-overview-provider.port.js';

export interface GetWorkspaceOverviewInput {
    readonly depth?: number | undefined;
    readonly includeStats?: boolean | undefined;
}

export class GetWorkspaceOverviewUseCase {
    constructor(private readonly provider: WorkspaceOverviewProvider) {}

    async execute(input: GetWorkspaceOverviewInput): Promise<Result<WorkspaceInfo, AppError>> {
        return this.provider.getOverview({
            depth: input.depth ?? 2,
            includeStats: input.includeStats ?? true,
        });
    }
}
