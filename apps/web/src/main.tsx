import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './fonts.css';
import './styles.css';
import { applyStoredTheme } from './theme-store.js';

applyStoredTheme();

const root = document.getElementById('root');

if (!root) {
  throw new Error('The application root is missing.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
