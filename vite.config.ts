import { defineConfig } from 'vite';
import path from 'path';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://vite.dev/config/
export default defineConfig({
  base: '',
  plugins: [react(), nodePolyfills({ include: ['path'] })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    sourcemap: true,
    outDir: 'fileglancer/ui',
    chunkSizeWarningLimit: 1024
  },
  test: {
    exclude: [
      '**/.pixi/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/ui-tests/**'
    ],
    globals: true,
    environment: 'jsdom',
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx,js,jsx}'],
      exclude: [
        '**/.pixi/**',
        '**/node_modules/**',
        '**/dist/**',
        '**/ui-tests/**'
      ]
    }
  }
});
