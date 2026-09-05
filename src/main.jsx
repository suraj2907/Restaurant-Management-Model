import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { seedIfEmpty } from './lib/store.js';
import './index.css';

// Runs before any component mounts, so no component's useLocalState effect
// can race it and overwrite the seed with an empty fallback.
seedIfEmpty();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
