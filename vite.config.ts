import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  base: '',
  plugins: [react()],
  build: {
    sourcemap: true,
    outDir: 'fileglancer/ui'
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
