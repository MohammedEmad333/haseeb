import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { maybeRunSelfTest } from './dev/selftest';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

// `?selftest=1` exercises the database driver and reports the result instead
// of starting the app. It is how CI verifies the native SQLite path, which
// only exists inside a device WebView.
if (!maybeRunSelfTest()) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
