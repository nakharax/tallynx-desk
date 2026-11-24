import path from 'node:path';
import { build } from 'esbuild';

const rootDir = process.cwd();
await build({
  entryPoints: [path.resolve(rootDir, 'server.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  outfile: path.resolve(rootDir, 'api', 'server.bundle.js'),
});
console.log('Prepared Vercel API bundle: api/server.bundle.js');
