import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { initPwaLifecycle } from './app/pwa-lifecycle';
import '@speech/ui/tokens.css';
import '@speech/ui/primitives.css';
import './styles/global.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing #root element');
}

initPwaLifecycle(registerSW);

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
