import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('./website/authorize', import.meta.url)),
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  build: { outDir: fileURLToPath(new URL('./work/consent', import.meta.url)), emptyOutDir: true }
});
