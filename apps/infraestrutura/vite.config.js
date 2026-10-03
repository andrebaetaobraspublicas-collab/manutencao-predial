import { defineConfig } from 'vite';

export default defineConfig({
  base: '/infraestrutura-editor/',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', rollupOptions: { input: { app: 'index.html', importer: 'import.html' } } },
});
