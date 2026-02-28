import * as esbuild from 'esbuild';

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
