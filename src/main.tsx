import '@fontsource-variable/plus-jakarta-sans/wght.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles/globals.css';
import { applyTheme } from './services/theme';

applyTheme(); // sync the saved choice and the browser-bar colour (public/theme-init.js already set data-theme before first paint)

// Workbox-generated service worker (vite-plugin-pwa): precaches the shell so the app loads offline.
registerSW({ immediate: true });

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
