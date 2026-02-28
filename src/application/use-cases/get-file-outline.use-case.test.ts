import { describe, it, expect } from 'vitest';
import { GetFileOutlineUseCase } from './get-file-outline.use-case.js';
import { Ok, Err } from '../../shared/result.js';
import type { FileOutlineProvider, FileOutlineOptions } from '../ports/file-outline-provider.port.js';
import type { FileOutline } from '../../domain/entities/file-outline.entity.js';
import type { AppError } from '../../domain/errors/app-error.js';

function makeOutline(): FileOutline {
    return {
        file: 'src/foo.ts',
        language: 'typescript',
        lines: 50,
        imports: [],
        symbols: [],
    };
}

describe('GetFileOutlineUseCase', () => {
    it('should return file outline on success', async () => {
        const outline = makeOutline();
        const provider: FileOutlineProvider = { getOutline: async () => Ok(outline) };
        const useCase = new GetFileOutlineUseCase(provider);
        const result = await useCase.execute({ file: 'src/foo.ts' });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toEqual(outline);
    });

    it('should apply default depth=2 and includeSignatures=true', async () => {
        let capturedOpts: FileOutlineOptions | undefined;
        const provider: FileOutlineProvider = {
            getOutline: async (_file, opts) => {
                capturedOpts = opts;
                return Ok(makeOutline());
            },
        };
        const useCase = new GetFileOutlineUseCase(provider);
        await useCase.execute({ file: 'src/foo.ts' });
        expect(capturedOpts?.depth).toBe(2);
        expect(capturedOpts?.includeSignatures).toBe(true);
    });

    it('should apply custom depth and includeSignatures', async () => {
        let capturedOpts: FileOutlineOptions | undefined;
        const provider: FileOutlineProvider = {
            getOutline: async (_file, opts) => {
                capturedOpts = opts;
                return Ok(makeOutline());
            },
        };
        const useCase = new GetFileOutlineUseCase(provider);
        await useCase.execute({ file: 'src/foo.ts', depth: 1, includeSignatures: false });
        expect(capturedOpts?.depth).toBe(1);
        expect(capturedOpts?.includeSignatures).toBe(false);
    });

    it('should propagate NOT_FOUND error', async () => {
        const err: AppError = { kind: 'NOT_FOUND', entity: 'file', id: 'src/foo.ts' };
        const provider: FileOutlineProvider = { getOutline: async () => Err(err) };
        const useCase = new GetFileOutlineUseCase(provider);
        const result = await useCase.execute({ file: 'src/foo.ts' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe('NOT_FOUND');
    });

    it('should pass file path to provider', async () => {
        let capturedFile: string | undefined;
        const provider: FileOutlineProvider = {
            getOutline: async (file, _opts) => {
                capturedFile = file;
                return Ok(makeOutline());
            },
        };
        const useCase = new GetFileOutlineUseCase(provider);
        await useCase.execute({ file: 'src/middleware/auth.ts' });
        expect(capturedFile).toBe('src/middleware/auth.ts');
    });
});
