import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import './index.css';
import './i18n';
import { AppRouter } from './app/router';

async function boot() {
  // VITE_USE_MOCKS=true serves the whole API contract from MSW (src/mocks); nothing of it is loaded otherwise
  if (import.meta.env.VITE_USE_MOCKS === 'true') {
    const { startMocks } = await import('./mocks/browser');
    await startMocks();
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AppRouter /></React.StrictMode>);
}
void boot();
