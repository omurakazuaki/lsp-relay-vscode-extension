import { describe, it, expect } from 'vitest';
import { FindReferencesUseCase } from './find-references.use-case.js';
import { SymbolLocation } from '../../domain/value-objects/symbol-location.value-object.js';
import { Ok, Err } from '../../shared/result.js';
import type { ReferenceProvider, ReferenceProviderResult } from '../ports/reference-provider.port.js';
import type { AppError } from '../../domain/errors/app-error.js';
import { DEFAULT_CONTEXT_LINES, DEFAULT_REF_LIMIT } from '../../shared/constants.js';

function makeLocation(): SymbolLocation {
    const result = SymbolLocation.create({ file: 'src/foo.ts', line: 1, character: 0 });
    if (!result.ok) throw new Error('Bad test location');
    return result.value;
}

function makeProviderResult(): ReferenceProviderResult {
    return {
        symbol: 'foo',
        total: 2,
        references: [
            { file: 'src/bar.ts', line: 5, context: 'import { foo }' },
            { file: 'src/baz.ts', line: 12, context: 'foo()' },
        ],
    };
}

describe('FindReferencesUseCase', () => {
    it('should return references on success', async () => {
        const provResult = makeProviderResult();
        const provider: ReferenceProvider = { findReferences: async () => Ok(provResult) };
        const useCase = new FindReferencesUseCase(provider);
        const result = await useCase.execute({ location: makeLocation() });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.symbol).toBe('foo');
            expect(result.value.references).toHaveLength(2);
        }
    });

    it('should apply default contextLines and limit', async () => {
        let capturedOpts: { contextLines: number; limit: number } | undefined;
        const provider: ReferenceProvider = {
            findReferences: async (_loc, opts) => {
                capturedOpts = opts;
                return Ok(makeProviderResult());
            },
        };
        const useCase = new FindReferencesUseCase(provider);
        await useCase.execute({ location: makeLocation() });
        expect(capturedOpts?.contextLines).toBe(DEFAULT_CONTEXT_LINES);
        expect(capturedOpts?.limit).toBe(DEFAULT_REF_LIMIT);
    });

    it('should apply custom contextLines and limit', async () => {
        let capturedOpts: { contextLines: number; limit: number } | undefined;
        const provider: ReferenceProvider = {
            findReferences: async (_loc, opts) => {
                capturedOpts = opts;
                return Ok(makeProviderResult());
            },
        };
        const useCase = new FindReferencesUseCase(provider);
        await useCase.execute({ location: makeLocation(), contextLines: 5, limit: 10 });
        expect(capturedOpts?.contextLines).toBe(5);
        expect(capturedOpts?.limit).toBe(10);
    });

    it('should propagate NOT_FOUND error', async () => {
        const err: AppError = { kind: 'NOT_FOUND', entity: 'symbol', id: 'src/foo.ts:1' };
        const provider: ReferenceProvider = { findReferences: async () => Err(err) };
        const useCase = new FindReferencesUseCase(provider);
        const result = await useCase.execute({ location: makeLocation() });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe('NOT_FOUND');
    });

    it('should return empty references list', async () => {
        const provider: ReferenceProvider = {
            findReferences: async () => Ok({ symbol: 'foo', total: 0, references: [] }),
        };
        const useCase = new FindReferencesUseCase(provider);
        const result = await useCase.execute({ location: makeLocation() });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.references).toHaveLength(0);
    });
});
