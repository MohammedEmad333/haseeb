/**
 * Driver selection.
 *
 * Native platforms get the platform's own SQLite; everything else — browser,
 * desktop shell, tests — gets the WebAssembly engine. The choice is made once,
 * here, so no repository or screen has to know which is in use.
 */

import type { BlobStore } from '../storage';
import type { DriverOptions, SqlDriver } from './driver';

export type { SqlDriver, SqlTx, DriverOptions, Row, SqlValue } from './driver';

export interface OpenDriverOptions extends DriverOptions {
  store?: BlobStore;
  /** Force a driver. Only tests and the diagnostics screen should set this. */
  driver?: 'sqljs' | 'capacitor';
}

/**
 * True on Android and iOS under Capacitor. Checked through the global rather
 * than by importing @capacitor/core at module scope, so a plain web build does
 * not pull the native plugin into its bundle.
 */
function isNativePlatform(): boolean {
  const capacitor = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof capacitor?.isNativePlatform === 'function' && capacitor.isNativePlatform();
}

/**
 * Hold until the document has finished loading.
 *
 * The driver arrives as its own chunk, and on a device that chunk is served by
 * the WebView's local server while Capacitor is still bringing its plugins up.
 * A dynamic import that loses that race does not merely fail once: a module
 * whose fetch failed is recorded as errored in the module map, so importing it
 * again returns the same error without touching the network — verified in
 * Chromium, three attempts, one request. There is no retrying past it, which
 * leaves not asking too early as the only fix.
 */
function documentReady(): Promise<void> {
  if (typeof document === 'undefined' || document.readyState === 'complete') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    window.addEventListener('load', () => resolve(), { once: true });
  });
}

/** True when a failure is the module map's, not the database's. */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(
    message,
  );
}

export async function openDriver(options: OpenDriverOptions = {}): Promise<SqlDriver> {
  const wanted = options.driver ?? (isNativePlatform() ? 'capacitor' : 'sqljs');

  if (wanted === 'capacitor') {
    await documentReady();
    const { CapacitorSqliteDriver } = await import('./capacitor');
    return CapacitorSqliteDriver.open(options);
  }

  const { SqlJsDriver } = await import('./sqljs');
  return SqlJsDriver.open(options);
}
