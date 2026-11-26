import { Component, StrictMode } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import './styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info); }
  render() {
    if (this.state.failed) return <div className="space-y-4 p-6"><h1 className="text-base font-semibold">サイドバーを読み込めませんでした</h1><p className="text-sm text-muted-foreground">サイドバーを再読み込みしてください。</p><Button type="button" onClick={() => { window.location.reload(); }}>再読み込み</Button></div>;
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><TooltipProvider delayDuration={400}><App /><Toaster position="bottom-center" closeButton offset={16} mobileOffset={16} style={{ width: 'min(356px, calc(100vw - 32px))' }} /></TooltipProvider></ErrorBoundary></StrictMode>);
