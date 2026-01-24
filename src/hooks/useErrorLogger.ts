import { useEffect } from 'react';
import { error as logError, warn as logWarn } from '@tauri-apps/plugin-log';

// Safely convert an argument to a loggable string without deep serialization
function toLoggableString(arg: unknown, maxLength = 500): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';

  // Handle Error objects - extract message and name
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}`;
  }

  // Handle strings directly
  if (typeof arg === 'string') {
    return arg.length > maxLength ? arg.slice(0, maxLength) + '...' : arg;
  }

  // Handle primitives
  if (typeof arg !== 'object') {
    return String(arg);
  }

  // For objects, provide a shallow summary instead of full serialization
  try {
    // Check if it has a message property (error-like objects)
    const obj = arg as Record<string, unknown>;
    if (obj.message && typeof obj.message === 'string') {
      const name = obj.name ? `${obj.name}: ` : '';
      return `${name}${obj.message}`;
    }

    // For arrays, just show length
    if (Array.isArray(arg)) {
      return `[Array(${arg.length})]`;
    }

    // For other objects, show type and keys count
    const keys = Object.keys(obj);
    const typeName = obj.constructor?.name || 'Object';
    return `[${typeName} with ${keys.length} keys]`;
  } catch {
    return '[Object]';
  }
}

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
      const msg = args.map(a => toLoggableString(a)).join(' ');
      logError(`[Console Error] ${msg}`);
    };

    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      origWarn.apply(console, args);
      const msg = args.map(a => toLoggableString(a)).join(' ');
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
