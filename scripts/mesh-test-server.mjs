import { build, preview } from 'vite';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sora-cars-browser-mesh-'));
await build({ configFile: false, root: process.cwd(), base: './', logLevel: 'error', build: { outDir: directory, emptyOutDir: true, target: 'es2022', rollupOptions: { input: path.resolve('tests/mesh-harness.html') } } });
const server = await preview({ configFile: false, root: process.cwd(), build: { outDir: directory }, preview: { host: '127.0.0.1', port: 5175, strictPort: true } });
console.log('Static mesh test harness: http://127.0.0.1:5175');
async function close() { await new Promise(resolve => server.httpServer.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); process.exit(0); }
process.on('SIGINT', () => { void close(); }); process.on('SIGTERM', () => { void close(); });
