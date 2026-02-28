import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
const buildExtension = args.includes('--extension') || (!args.includes('--cli'));
const buildCli = args.includes('--cli') || (!args.includes('--extension'));

if (buildExtension) {
    await esbuild.build({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        outfile: 'out/extension.js',
        external: ['vscode'],
        format: 'cjs',
        platform: 'node',
        target: 'node20',
        sourcemap: true,
        minify: false,
    });
    console.log('Build complete: out/extension.js');
}

// Copy SKILL.md template to out/ so it can be read at runtime
fs.mkdirSync('out', { recursive: true });
fs.copyFileSync(
    path.join('src', 'infrastructure', 'skill', 'SKILL.md'),
    path.join('out', 'SKILL.md'),
);
console.log('Copied: out/SKILL.md');

if (buildCli) {
    await esbuild.build({
        entryPoints: ['src/infrastructure/cli/semcode.ts'],
        bundle: true,
        outfile: 'out/cli.js',
        external: ['vscode'],
        format: 'cjs',
        platform: 'node',
        target: 'node20',
        sourcemap: true,
        minify: false,
        banner: { js: '#!/usr/bin/env node' },
    });
    console.log('Build complete: out/cli.js');
}
