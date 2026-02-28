import type { Result } from '../../shared/result.js';
import type { AppError } from '../../domain/errors/app-error.js';
import type { FileOutline } from '../../domain/entities/file-outline.entity.js';
import type { FileOutlineProvider } from '../ports/file-outline-provider.port.js';

export interface GetFileOutlineInput {
    readonly file: string;
    readonly depth?: number | undefined;
    readonly includeSignatures?: boolean | undefined;
}

export class GetFileOutlineUseCase {
    constructor(private readonly provider: FileOutlineProvider) {}

    async execute(input: GetFileOutlineInput): Promise<Result<FileOutline, AppError>> {
        return this.provider.getOutline(input.file, {
            depth: input.depth ?? 2,
            includeSignatures: input.includeSignatures ?? true,
        });
    }
}
