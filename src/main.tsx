import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/playfair-display/cyrillic-400.css';
import '@fontsource/playfair-display/latin-400.css';
import '@fontsource/playfair-display/cyrillic-400-italic.css';
import '@fontsource/playfair-display/latin-400-italic.css';
import '@fontsource/playfair-display/latin-500.css';
import '@fontsource/jost/cyrillic-400.css';
import '@fontsource/jost/latin-400.css';
import '@fontsource/jost/cyrillic-500.css';
import '@fontsource/jost/latin-500.css';
import '@fontsource/italianno/latin-400.css';
import './styles.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
