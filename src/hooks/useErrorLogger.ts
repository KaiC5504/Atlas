import { useEffect } from 'react';
import { error as logError, warn as logWarn } from '@tauri-apps/plugin-log';

export function useErrorLogger(): void {
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message || String(event.reason);
      const stack = event.reason?.stack || '';
      logError(`[Unhandled Rejection] ${msg}\n${stack}`);
    };

    const handleError = (event: ErrorEvent) => {
      const source = event.filename
        ? `${event.filename}:${event.lineno}:${event.colno}`
        : 'unknown';
      logError(`[Global Error] ${event.message} at ${source}`);
    };

    const origError = console.error;
    console.error = (...args: unknown[]) => {
      origError.apply(console, args);
      const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      logError(`[Console Error] ${msg}`);
    };

    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      origWarn.apply(console, args);
      const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      logWarn(`[Console Warn] ${msg}`);
    };

    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('error', handleError);
      console.error = origError;
      console.warn = origWarn;
    };
  }, []);
}
