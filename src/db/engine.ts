/**
 * SQLite engine bootstrap.
 *
 * sql.js is a real SQLite compiled to WebAssembly, so the same engine, the
 * same SQL and the same schema run on web, desktop shell and mobile WebView.
 * The wasm binary ships inside the bundle — never a CDN — because the app has
 * to start with networking disabled.
 *
 * On a native shell that offers a faster SQLite (better-sqlite3 under Tauri,
 * op-sqlite under Capacitor), only this file needs a sibling: everything
 * above it talks SQL, not sql.js.
 */

import initSqlJs, { type Database as SqlJsDatabase, type SqlJsStatic } from 'sql.js';
// Resolved and fingerprinted by the bundler, so the wasm can never drift out
// of step with the sql.js version in package.json. `base: './'` keeps the
// emitted URL relative, which is what makes it load under file:// in the
// desktop and mobile shells too.
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';

let enginePromise: Promise<SqlJsStatic> | null = null;

async function nodeWasmBinary(): Promise<Uint8Array | null> {
  // Vitest and any headless tooling run outside a browser, where there is no
  // document to resolve an asset URL against; read the binary off disk.
  if (typeof window !== 'undefined') return null;
  const { readFile } = await import('node:fs/promises');
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  return new Uint8Array(await readFile(require.resolve('sql.js/dist/sql-wasm.wasm')));
}

export function loadSqlJs(): Promise<SqlJsStatic> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const wasmBinary = await nodeWasmBinary();
      // `wasmBinary` is an Emscripten module option that sql.js's bundled
      // types spell as an ArrayBuffer-only field, hence the cast.
      return initSqlJs(
        (wasmBinary ? { wasmBinary } : { locateFile: () => wasmUrl }) as Parameters<
          typeof initSqlJs
        >[0],
      );
    })().catch((error) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

export type { SqlJsDatabase };
