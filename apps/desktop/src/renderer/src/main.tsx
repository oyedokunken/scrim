import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { routeFromHash } from './routes';
import './styles.css';

// The route is an attribute, not a style, so the transparent control window works under the policy.
document.documentElement.dataset['route'] = routeFromHash(window.location.hash);

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
