import type { Result } from '../../shared/result.js';
import { Err, Ok } from '../../shared/result.js';
import type { AppError } from '../errors/app-error.js';

export interface SymbolLocationInput {
    readonly file: string;
    readonly line: number;       // 1-based
    readonly character?: number | undefined; // 0-based, defaults to 0
}

/** Validated, immutable location of a symbol within a file. */
export class SymbolLocation {
    private constructor(
        readonly file: string,
        readonly line: number,      // 1-based
        readonly character: number, // 0-based
    ) {}

    static create(input: SymbolLocationInput): Result<SymbolLocation, AppError> {
        if (!input.file || input.file.trim().length === 0) {
            return Err({ kind: 'VALIDATION', field: 'file', message: 'file must not be empty' });
        }
        if (!Number.isInteger(input.line) || input.line < 1) {
            return Err({
                kind: 'VALIDATION',
                field: 'line',
                message: 'line must be a positive integer (1-based)',
            });
        }
        const character = input.character ?? 0;
        if (!Number.isInteger(character) || character < 0) {
            return Err({
                kind: 'VALIDATION',
                field: 'character',
                message: 'character must be a non-negative integer (0-based)',
            });
        }
        return Ok(new SymbolLocation(input.file.trim(), input.line, character));
    }
}
