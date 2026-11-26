import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Launcher from './Launcher';
import { createLauncherAdapter } from './lib/launcher-search';
import './styles.css';

const adapter = createLauncherAdapter();
createRoot(document.getElementById('root')!).render(<StrictMode><Launcher adapter={adapter} /></StrictMode>);
