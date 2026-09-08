/**
 * SQLite engine bootstrap.
 *
 * sql.js is a real SQLite compiled to WebAssembly, so the same engine, the
 * same SQL and the same schema run on web, desktop shell and mobile WebView.
 * The wasm binary is served from the app bundle — never a CDN — because the
 * app has to start with networking disabled.
 *
 * On a native shell that offers a faster SQLite (better-sqlite3 under Tauri,
 * op-sqlite under Capacitor), only `loadSqlJs` needs a sibling: everything
 * above this file talks SQL, not sql.js.
 */

import initSqlJs, { type Database as SqlJsDatabase, type SqlJsStatic } from 'sql.js';

let enginePromise: Promise<SqlJsStatic> | null = null;

async function nodeWasmBinary(): Promise<ArrayBuffer | null> {
  // Vitest and any headless tooling run outside a browser, where there is no
  // URL to fetch the wasm from; read it off disk instead.
  if (typeof window !== 'undefined') return null;
  const { readFile } = await import('node:fs/promises');
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const path = require.resolve('sql.js/dist/sql-wasm.wasm');
  const buffer = await readFile(path);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

export function loadSqlJs(): Promise<SqlJsStatic> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const wasmBinary = await nodeWasmBinary();
      // `wasmBinary` is an Emscripten module option that sql.js's bundled
      // types spell as an ArrayBuffer-only field, hence the cast.
      return initSqlJs(
        (wasmBinary
          ? { wasmBinary }
          : // Vite copies /public verbatim, and `base: './'` keeps the URL
            // valid under file:// in the desktop and mobile shells.
            { locateFile: (file: string) => new URL(`./${file}`, document.baseURI).href }) as Parameters<typeof initSqlJs>[0],
      );
    })().catch((error) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

export type { SqlJsDatabase };
