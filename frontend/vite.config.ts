import { defineConfig } from 'vite';
import path from 'path';
import { existsSync } from 'fs';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const overridePath = path.resolve(__dirname, './viewers.config.yaml');
const defaultConfigPath = path.resolve(
  __dirname,
  './src/config/viewers.config.yaml'
);
const viewersConfigPath = existsSync(overridePath)
  ? overridePath
  : defaultConfigPath;

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), nodePolyfills({ include: ['path'] })],
  resolve: {
    alias: [
      {
        find: /^@\/config\/viewers\.config\.yaml(\?.*)?$/,
        replacement: viewersConfigPath + '$1'
      },
      { find: '@', replacement: path.resolve(__dirname, './src') }
    ]
  },
  css: {
    lightningcss: {
      errorRecovery: true
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
