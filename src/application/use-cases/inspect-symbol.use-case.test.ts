import { describe, it, expect } from 'vitest';
import { InspectSymbolUseCase } from './inspect-symbol.use-case.js';
import { SymbolLocation } from '../../domain/value-objects/symbol-location.value-object.js';
import { Ok, Err } from '../../shared/result.js';
import type { SymbolInspector } from '../ports/symbol-inspector.port.js';
import type { SymbolDetail } from '../../domain/entities/symbol-detail.entity.js';
import type { AppError } from '../../domain/errors/app-error.js';

function makeLocation(): SymbolLocation {
    const result = SymbolLocation.create({ file: 'src/foo.ts', line: 10, character: 5 });
    if (!result.ok) throw new Error('Bad test location');
    return result.value;
}

function makeDetail(): SymbolDetail {
    return { symbol: 'foo', kind: 'function', signature: '() => void', doc: null, body: null };
}

function makeMockInspector(result: Awaited<ReturnType<SymbolInspector['inspect']>>): SymbolInspector {
    return { inspect: async () => result };
}

describe('InspectSymbolUseCase', () => {
    it('should return symbol detail on success', async () => {
        const detail = makeDetail();
        const useCase = new InspectSymbolUseCase(makeMockInspector(Ok(detail)));
        const result = await useCase.execute({ location: makeLocation() });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toEqual(detail);
    });

    it('should use default inspect fields when include is omitted', async () => {
        let capturedFields: ReadonlyArray<string> | undefined;
        const inspector: SymbolInspector = {
            inspect: async (_loc, include) => {
                capturedFields = include;
                return Ok(makeDetail());
            },
        };
        const useCase = new InspectSymbolUseCase(inspector);
        await useCase.execute({ location: makeLocation() });
        expect(capturedFields).toEqual(['signature', 'doc', 'body']);
    });

    it('should use provided include fields', async () => {
        let capturedFields: ReadonlyArray<string> | undefined;
        const inspector: SymbolInspector = {
            inspect: async (_loc, include) => {
                capturedFields = include;
                return Ok(makeDetail());
            },
        };
        const useCase = new InspectSymbolUseCase(inspector);
        await useCase.execute({ location: makeLocation(), include: ['signature', 'type_hierarchy'] });
        expect(capturedFields).toEqual(['signature', 'type_hierarchy']);
    });

    it('should propagate NOT_FOUND error', async () => {
        const err: AppError = { kind: 'NOT_FOUND', entity: 'symbol', id: 'src/foo.ts:10' };
        const useCase = new InspectSymbolUseCase(makeMockInspector(Err(err)));
        const result = await useCase.execute({ location: makeLocation() });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe('NOT_FOUND');
    });

    it('should propagate LSP_UNAVAILABLE error', async () => {
        const err: AppError = { kind: 'LSP_UNAVAILABLE', reason: 'not ready' };
        const useCase = new InspectSymbolUseCase(makeMockInspector(Err(err)));
        const result = await useCase.execute({ location: makeLocation() });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe('LSP_UNAVAILABLE');
    });
});
