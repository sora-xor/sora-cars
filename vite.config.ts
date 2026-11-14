import { defineConfig } from 'vite';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

// This is an explicitly compressed asset decoded by ArchitectureAmbient, not an
// HTTP-encoded representation. Vite's .gz inference would otherwise decode it twice.
const storedGzip = (directory: string) => async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
  const path = '/assets/drive-optimized/v1/models/architecture-ambient/geometry.bin.gz';
  if (request.url?.split('?')[0] !== path || !['GET', 'HEAD'].includes(request.method ?? '')) { next(); return; }
  const file = resolve(directory, path.slice(1));
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) { next(); return; }
  response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-cache' });
  if (request.method === 'HEAD') response.end();
  else createReadStream(file).on('error', error => response.destroy(error)).pipe(response);
};

export default defineConfig({
  base: './',
  plugins: [{
    name: 'stored-gzip-asset-bytes',
    configureServer(server) { server.middlewares.use(storedGzip(server.config.publicDir)); },
    configurePreviewServer(server) { server.middlewares.use(storedGzip(resolve(server.config.root, server.config.build.outDir))); },
  }],
  optimizeDeps: { entries: ['index.html', 'tests/*-harness.html'] },
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    // Retained native snapshots can contain entire sibling checkouts and targets.
    watch: { ignored: ['**/output/**', '**/artifacts/**'] },
  },
  build: { target: 'es2022', sourcemap: true },
});
