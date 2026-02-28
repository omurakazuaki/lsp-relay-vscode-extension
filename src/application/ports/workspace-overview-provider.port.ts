import type { Result } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { WorkspaceInfo } from '../../domain/entities/workspace-info.entity.js';

export interface WorkspaceOverviewOptions {
    readonly depth: number;
    readonly includeStats: boolean;
}

/**
 * Port: returns a high-level summary of the workspace.
 * Implementations live in infrastructure/vscode-adapter/.
 */
export interface WorkspaceOverviewProvider {
    getOverview(options: WorkspaceOverviewOptions): Promise<Result<WorkspaceInfo, AppError>>;
}
