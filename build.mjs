import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

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

// Copy SKILL.md template to out/ so it can be read at runtime
fs.mkdirSync('out', { recursive: true });
fs.copyFileSync(
    path.join('src', 'infrastructure', 'skill', 'SKILL.md'),
    path.join('out', 'SKILL.md'),
);
console.log('Copied: out/SKILL.md');
