import { describe, it, expect } from 'vitest';
import { GetDiagnosticsUseCase } from './get-diagnostics.use-case.js';
import { Ok, Err } from '../../shared/result.js';
import type { DiagnosticsProvider, DiagnosticsOptions } from '../ports/diagnostics-provider.port.js';
import type { FileDiagnostics } from '../../domain/entities/diagnostic.entity.js';
import type { AppError } from '../../domain/errors/app-error.js';

function makeFileDiagnostics(): FileDiagnostics {
    return {
        file: 'src/foo.ts',
        diagnostics: [
            {
                line: 5,
                character: 0,
                severity: 'error',
                message: 'some error',
                source: 'typescript',
                code: 2345,
                context: null,
            },
        ],
    };
}

describe('GetDiagnosticsUseCase', () => {
    it('should return diagnostics on success', async () => {
        const diags = [makeFileDiagnostics()];
        const provider: DiagnosticsProvider = { getDiagnostics: async () => Ok(diags) };
        const useCase = new GetDiagnosticsUseCase(provider);
        const result = await useCase.execute({});
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toHaveLength(1);
    });

    it('should apply default severity=[error,warning] and file=null when omitted', async () => {
        let capturedOpts: DiagnosticsOptions | undefined;
        const provider: DiagnosticsProvider = {
            getDiagnostics: async (opts) => {
                capturedOpts = opts;
                return Ok([]);
            },
        };
        const useCase = new GetDiagnosticsUseCase(provider);
        await useCase.execute({});
        expect(capturedOpts?.severity).toEqual(['error', 'warning']);
        expect(capturedOpts?.file).toBeNull();
    });

    it('should pass file filter and custom severity', async () => {
        let capturedOpts: DiagnosticsOptions | undefined;
        const provider: DiagnosticsProvider = {
            getDiagnostics: async (opts) => {
                capturedOpts = opts;
                return Ok([]);
            },
        };
        const useCase = new GetDiagnosticsUseCase(provider);
        await useCase.execute({ file: 'src/foo.ts', severity: ['error'] });
        expect(capturedOpts?.file).toBe('src/foo.ts');
        expect(capturedOpts?.severity).toEqual(['error']);
    });

    it('should propagate LSP_UNAVAILABLE error', async () => {
        const err: AppError = { kind: 'LSP_UNAVAILABLE', reason: 'not ready' };
        const provider: DiagnosticsProvider = { getDiagnostics: async () => Err(err) };
        const useCase = new GetDiagnosticsUseCase(provider);
        const result = await useCase.execute({});
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe('LSP_UNAVAILABLE');
    });

    it('should return empty array when no diagnostics', async () => {
        const provider: DiagnosticsProvider = { getDiagnostics: async () => Ok([]) };
        const useCase = new GetDiagnosticsUseCase(provider);
        const result = await useCase.execute({});
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toHaveLength(0);
    });
});
