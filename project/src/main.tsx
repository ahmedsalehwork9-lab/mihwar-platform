import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './components/styles/theme.css';
import './components/styles/light-tokens.css';
import { ThemeProvider } from './context/ThemeContext';
import { registerPwa } from './pwa/registerPwa';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
);

registerPwa();
