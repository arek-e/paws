import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { App } from './App.js';
import './index.css';

// Initialize theme from localStorage before render to avoid flash
const savedTheme = localStorage.getItem('paws_theme');
if (savedTheme === 'light') {
  document.documentElement.classList.remove('dark');
}
// Default is dark (already set in index.html)

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <TooltipProvider>
      <App />
      <Toaster />
    </TooltipProvider>
  </StrictMode>,
);
