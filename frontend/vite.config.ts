import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), nodePolyfills({ include: ['path'] })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  css: {
    lightningcss: {
      errorRecovery: true
    }
  },
  server: {
    host: '0.0.0.0',
    https:
      process.env.SSL_KEYFILE && process.env.SSL_CERTFILE
        ? {
            key: fs.readFileSync(process.env.SSL_KEYFILE),
            cert: fs.readFileSync(process.env.SSL_CERTFILE)
          }
        : undefined,
    proxy: {
      '/api': {
        target: process.env.SSL_KEYFILE
          ? 'https://localhost:7878'
          : 'http://localhost:7878',
        secure: false
      }
    }
  },
  build: {
    sourcemap: true,
    outDir: '../fileglancer/ui',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      }
    }
  },
  test: {
    exclude: [
      '**/.pixi/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/ui-tests/**'
    ],
    globals: true,
    environment: 'happy-dom',
    setupFiles: 'src/__tests__/setup.ts',
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx,js,jsx}'],
      exclude: [
        '**/.pixi/**',
        '**/node_modules/**',
        '**/dist/**',
        '**/ui-tests/**'
      ]
    },
    silent: 'passed-only'
  }
});
