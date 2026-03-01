import { describe, it, expect } from 'vitest';
import { SearchSymbolsUseCase } from './search-symbols.use-case.js';
import { SearchQuery } from '../../domain/value-objects/search-query.value-object.js';
import { Ok, Err } from '../../shared/result.js';
import type { SymbolSearcher } from '../ports/symbol-searcher.port.js';
import type { SymbolInfo } from '../../domain/entities/symbol-info.entity.js';

// ---- helpers ---------------------------------------------------------------

function makeSearcher(overrides: Partial<SymbolSearcher> = {}): SymbolSearcher {
    return {
        search: async () => Ok([]),
        ...overrides,
    };
}

function makeSymbol(overrides: Partial<SymbolInfo> = {}): SymbolInfo {
    return {
        symbol: 'testFn',
        kind: 'function',
        file: 'src/index.ts',
        line: 1,
        container: null,
        signature: null,
        doc: null,
        exported: true,
        body: null,
        relevance: 0.9,
        ...overrides,
    };
}

function validQuery(overrides: { limit?: number } = {}): SearchQuery {
    const result = SearchQuery.create({ query: 'test', ...overrides });
    if (!result.ok) throw new Error('fixture creation failed');
    return result.value;
}

// ---- tests -----------------------------------------------------------------

describe('SearchSymbolsUseCase', () => {
    it('returns matching symbols for a valid query', async () => {
        const symbols = [makeSymbol({ symbol: 'authMiddleware' })];
        const searcher = makeSearcher({ search: async () => Ok(symbols) });
        const useCase = new SearchSymbolsUseCase(searcher);

        const result = await useCase.execute(validQuery());

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.results).toHaveLength(1);
            expect(result.value.results[0]?.symbol).toBe('authMiddleware');
            expect(result.value.total).toBe(1);
            expect(result.value.truncated).toBe(false);
        }
    });

    it('returns empty results when the searcher finds nothing', async () => {
        const useCase = new SearchSymbolsUseCase(makeSearcher());

        const result = await useCase.execute(validQuery());

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.results).toHaveLength(0);
            expect(result.value.truncated).toBe(false);
        }
    });

    it('propagates LSP_UNAVAILABLE when the searcher fails', async () => {
        const searcher = makeSearcher({
            search: async () => Err({ kind: 'LSP_UNAVAILABLE', reason: 'server not ready' }),
        });
        const useCase = new SearchSymbolsUseCase(searcher);

        const result = await useCase.execute(validQuery());

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.kind).toBe('LSP_UNAVAILABLE');
        }
    });

    it('truncates results to the query limit', async () => {
        const symbols = Array.from({ length: 20 }, (_, i) =>
            makeSymbol({ symbol: `fn${i}` }),
        );
        const searcher = makeSearcher({ search: async () => Ok(symbols) });
        const useCase = new SearchSymbolsUseCase(searcher);

        const result = await useCase.execute(validQuery({ limit: 5 }));

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.results).toHaveLength(5);
            expect(result.value.total).toBe(20);
            expect(result.value.truncated).toBe(true);
        }
    });

    it('passes through body field when searcher returns symbols with bodies', async () => {
        const symbols = [
            makeSymbol({ symbol: 'myFunc', body: 'function myFunc() { return 42; }' }),
        ];
        const searcher = makeSearcher({ search: async () => Ok(symbols) });
        const useCase = new SearchSymbolsUseCase(searcher);

        const query = SearchQuery.create({ query: 'myFunc', includeBody: true });
        if (!query.ok) throw new Error('fixture creation failed');

        const result = await useCase.execute(query.value);

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.results[0]?.body).toBe('function myFunc() { return 42; }');
        }
    });

    it('returns null body when includeBody is not set', async () => {
        const symbols = [makeSymbol({ symbol: 'myFunc', body: null })];
        const searcher = makeSearcher({ search: async () => Ok(symbols) });
        const useCase = new SearchSymbolsUseCase(searcher);

        const result = await useCase.execute(validQuery());

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.results[0]?.body).toBeNull();
        }
    });

    it('is not truncated when results are exactly at the limit', async () => {
        const symbols = Array.from({ length: 5 }, (_, i) => makeSymbol({ symbol: `fn${i}` }));
        const searcher = makeSearcher({ search: async () => Ok(symbols) });
        const useCase = new SearchSymbolsUseCase(searcher);

        const result = await useCase.execute(validQuery({ limit: 5 }));

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.truncated).toBe(false);
        }
    });
});

describe('SearchQuery.create', () => {
    it('rejects an empty query string', () => {
        const result = SearchQuery.create({ query: '   ' });
        expect(result.ok).toBe(false);
        if (!result.ok && result.error.kind === 'VALIDATION') {
            expect(result.error.kind).toBe('VALIDATION');
            expect(result.error.field).toBe('query');
        } else {
            expect(result.ok).toBe(false); // ensure we entered the branch
        }
    });

    it('rejects file scope without a path', () => {
        const result = SearchQuery.create({ query: 'test', scope: 'file' });
        expect(result.ok).toBe(false);
        if (!result.ok && result.error.kind === 'VALIDATION') {
            expect(result.error.kind).toBe('VALIDATION');
            expect(result.error.field).toBe('path');
        } else {
            expect(result.ok).toBe(false);
        }
    });

    it('caps the limit at MAX_SEARCH_LIMIT (100)', () => {
        const result = SearchQuery.create({ query: 'test', limit: 9999 });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.limit).toBe(100);
        }
    });

    it('stores includeBody flag (default false)', () => {
        const result = SearchQuery.create({ query: 'test' });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.includeBody).toBe(false);
        }

        const withBody = SearchQuery.create({ query: 'test', includeBody: true });
        expect(withBody.ok).toBe(true);
        if (withBody.ok) {
            expect(withBody.value.includeBody).toBe(true);
        }
    });

    it('trims the query string', () => {
        const result = SearchQuery.create({ query: '  auth  ' });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.query).toBe('auth');
        }
    });
});
