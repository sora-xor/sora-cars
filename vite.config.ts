import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  optimizeDeps: { entries: ['index.html', 'tests/*-harness.html'] },
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    // Retained native snapshots can contain entire sibling checkouts and targets.
    watch: { ignored: ['**/output/**', '**/artifacts/**'] },
  },
  build: { target: 'es2022', sourcemap: true },
});
