import type { Result } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { FileOutline } from '../../domain/entities/file-outline.entity.js';

export interface FileOutlineOptions {
    readonly depth: number;
    readonly includeSignatures: boolean;
}

/**
 * Port: returns the structural outline of a file.
 * Implementations live in infrastructure/vscode-adapter/.
 */
export interface FileOutlineProvider {
    getOutline(
        file: string,
        options: FileOutlineOptions,
    ): Promise<Result<FileOutline, AppError>>;
}
