/**
 * Unified logger for Atlas frontend
 * Integrates with tauri-plugin-log to write to the same log file as the backend
 */

import { error, warn, info, debug, trace, attachConsole } from "@tauri-apps/plugin-log";

// Attach console to see logs in dev tools (debug builds)
attachConsole().catch(() => {
  // Ignore errors - console attachment is optional
});

// Re-export log functions with type-safe API
export const log = {
  error: (message: string) => error(message),
  warn: (message: string) => warn(message),
  info: (message: string) => info(message),
  debug: (message: string) => debug(message),
  trace: (message: string) => trace(message),
};

export { error, warn, info, debug, trace };
