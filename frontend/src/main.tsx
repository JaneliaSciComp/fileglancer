import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { initializeViewerManifests } from '@bioimagetools/capability-manifest';

import './index.css';
import App from './App';
import { queryClient } from './queryClient';

// Expose initialization function for tests
// This allows Playwright tests to call initializeViewerManifests via page.evaluate()
// since it needs to run in the browser context (uses fetch API), not Node.js context
declare global {
  interface Window {
    initializeViewerManifests?: typeof initializeViewerManifests;
  }
}

window.initializeViewerManifests = initializeViewerManifests;

const startApp = async () => {
  await initializeViewerManifests();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>
  );
};

void startApp();
