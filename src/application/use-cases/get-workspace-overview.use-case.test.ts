import { describe, it, expect } from 'vitest';
import { GetWorkspaceOverviewUseCase } from './get-workspace-overview.use-case.js';
import { Ok, Err } from '../../shared/result.js';
import type {
    WorkspaceOverviewProvider,
    WorkspaceOverviewOptions,
} from '../ports/workspace-overview-provider.port.js';
import type { WorkspaceInfo } from '../../domain/entities/workspace-info.entity.js';
import type { AppError } from '../../domain/errors/app-error.js';

function makeWorkspaceInfo(): WorkspaceInfo {
    return {
        name: 'my-project',
        root: '/home/user/my-project',
        languages: { typescript: { files: 10, lines: 1000 } },
        structure: ['src/', '  index.ts'],
        entryPoints: ['src/index.ts'],
        activeDiagnostics: { errors: 0, warnings: 0 },
    };
}

describe('GetWorkspaceOverviewUseCase', () => {
    it('should return workspace info on success', async () => {
        const info = makeWorkspaceInfo();
        const provider: WorkspaceOverviewProvider = { getOverview: async () => Ok(info) };
        const useCase = new GetWorkspaceOverviewUseCase(provider);
        const result = await useCase.execute({});
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toEqual(info);
    });

    it('should apply default depth=2 and includeStats=true', async () => {
        let capturedOpts: WorkspaceOverviewOptions | undefined;
        const provider: WorkspaceOverviewProvider = {
            getOverview: async (opts) => {
                capturedOpts = opts;
                return Ok(makeWorkspaceInfo());
            },
        };
        const useCase = new GetWorkspaceOverviewUseCase(provider);
        await useCase.execute({});
        expect(capturedOpts?.depth).toBe(2);
        expect(capturedOpts?.includeStats).toBe(true);
    });

    it('should apply custom depth and includeStats', async () => {
        let capturedOpts: WorkspaceOverviewOptions | undefined;
        const provider: WorkspaceOverviewProvider = {
            getOverview: async (opts) => {
                capturedOpts = opts;
                return Ok(makeWorkspaceInfo());
            },
        };
        const useCase = new GetWorkspaceOverviewUseCase(provider);
        await useCase.execute({ depth: 3, includeStats: false });
        expect(capturedOpts?.depth).toBe(3);
        expect(capturedOpts?.includeStats).toBe(false);
    });

    it('should propagate INTERNAL error', async () => {
        const err: AppError = { kind: 'INTERNAL', message: 'unexpected' };
        const provider: WorkspaceOverviewProvider = { getOverview: async () => Err(err) };
        const useCase = new GetWorkspaceOverviewUseCase(provider);
        const result = await useCase.execute({});
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe('INTERNAL');
    });

    it('should return workspace with empty structure', async () => {
        const info: WorkspaceInfo = {
            name: 'empty',
            root: '/tmp/empty',
            languages: {},
            structure: [],
            entryPoints: [],
            activeDiagnostics: { errors: 0, warnings: 0 },
        };
        const provider: WorkspaceOverviewProvider = { getOverview: async () => Ok(info) };
        const useCase = new GetWorkspaceOverviewUseCase(provider);
        const result = await useCase.execute({});
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.structure).toHaveLength(0);
            expect(result.value.languages).toEqual({});
        }
    });
});
