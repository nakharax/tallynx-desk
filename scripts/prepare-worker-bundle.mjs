import path from 'node:path';
import { build } from 'esbuild';

const rootDir = process.cwd();
await build({
  entryPoints: [path.resolve(rootDir, 'worker', 'index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  outfile: path.resolve(rootDir, 'dist-worker', 'worker.bundle.mjs'),
});
console.log('Prepared FundedNext worker bundle: dist-worker/worker.bundle.mjs');
