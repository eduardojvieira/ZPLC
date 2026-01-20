import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  platform: 'node',
  target: 'node18',
  format: 'esm',
  sourcemap: true,
  minify: false,
  external: [],
});

// Also generate declaration file with tsc
import { execSync } from 'child_process';
execSync('bunx tsc --emitDeclarationOnly --declaration --outDir dist', { stdio: 'inherit' });

console.log('Build complete!');
