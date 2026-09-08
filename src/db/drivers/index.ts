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

export async function openDriver(options: OpenDriverOptions = {}): Promise<SqlDriver> {
  const wanted = options.driver ?? (isNativePlatform() ? 'capacitor' : 'sqljs');

  if (wanted === 'capacitor') {
    const { CapacitorSqliteDriver } = await import('./capacitor');
    return CapacitorSqliteDriver.open(options);
  }

  const { SqlJsDriver } = await import('./sqljs');
  return SqlJsDriver.open(options);
}
