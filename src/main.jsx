import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { theme } from './theme.js';

// Global resets live here rather than a stylesheet, matching the inline-style
// approach used throughout the app.
const style = document.createElement('style');
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body, #root { height: 100%; }
  body {
    margin: 0;
    background: ${theme.color.bg};
    color: ${theme.color.text};
    font-family: ${theme.font.stack};
    -webkit-font-smoothing: antialiased;
  }
  button { font: inherit; cursor: pointer; }
  textarea { font: inherit; }
  :focus-visible { outline: 2px solid ${theme.color.accent}; outline-offset: 2px; }
`;
document.head.appendChild(style);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
