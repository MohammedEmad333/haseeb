/**
 * The WebAssembly driver: sql.js plus AES-256-GCM at rest.
 *
 * This is what runs in a browser, in the desktop shell and under test. The
 * whole database lives in memory and is sealed and written as one image, so
 * writes are debounced — a save per keystroke would be pointless churn, and a
 * save only on close would lose work to a killed tab.
 */

import schemaSql from '../schema.sql?raw';
import { loadSqlJs, type SqlJsDatabase } from '../engine';
import { createBlobStore, type BlobStore } from '../storage';
import {
  deriveKeyFromPassphrase,
  generateRawKey,
  generateSalt,
  importRawKey,
  open as openSealed,
  seal,
} from '../crypto';
import type { DriverOptions, Row, SqlDriver, SqlTx, SqlValue } from './driver';

const DB_KEY = 'haseeb.db';
const DEVICE_KEY_KEY = 'haseeb.devicekey';
const SALT_KEY = 'haseeb.salt';
const SAVE_DEBOUNCE_MS = 400;

export class SqlJsDriver implements SqlDriver {
  readonly kind = 'sqljs';

  #sqlite: SqlJsDatabase;
  #key: CryptoKey;
  #store: BlobStore;
  #ephemeral: boolean;
  #saveTimer: ReturnType<typeof setTimeout> | null = null;
  #pendingSave: Promise<void> = Promise.resolve();
  /** Serialises transactions: sql.js has no nested-transaction support. */
  #lock: Promise<unknown> = Promise.resolve();

  private constructor(
    sqlite: SqlJsDatabase,
    key: CryptoKey,
    store: BlobStore,
    ephemeral: boolean,
  ) {
    this.#sqlite = sqlite;
    this.#key = key;
    this.#store = store;
    this.#ephemeral = ephemeral;
  }

  static async open(options: DriverOptions & { store?: BlobStore } = {}): Promise<SqlJsDriver> {
    const store = options.store ?? createBlobStore();
    const ephemeral = options.ephemeral ?? false;
    const SQL = await loadSqlJs();

    const key = await resolveKey(store, options.passphrase, ephemeral);
    const sealed = ephemeral ? null : await store.read(DB_KEY);

    const sqlite = sealed
      ? new SQL.Database(await openSealed(key, sealed))
      : new SQL.Database();

    // Applying the schema on every open keeps an existing file forward
    // compatible; every statement is CREATE ... IF NOT EXISTS.
    sqlite.run(schemaSql);

    const driver = new SqlJsDriver(sqlite, key, store, ephemeral);
    if (!sealed) await driver.flush();
    return driver;
  }

  get location(): string {
    return this.#ephemeral ? 'ذاكرة مؤقتة (بدون حفظ)' : this.#store.describe();
  }

  async execute(sql: string, params: readonly SqlValue[] = []): Promise<void> {
    this.#sqlite.run(sql, params as SqlValue[]);
    this.#scheduleSave();
  }

  async query<T extends Row = Row>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
    return this.#querySync<T>(sql, params);
  }

  #querySync<T extends Row = Row>(sql: string, params: readonly SqlValue[] = []): T[] {
    const statement = this.#sqlite.prepare(sql);
    try {
      statement.bind(params as SqlValue[]);
      const rows: T[] = [];
      while (statement.step()) rows.push(statement.getAsObject() as T);
      return rows;
    } finally {
      statement.free();
    }
  }

  async transaction<T>(work: (tx: SqlTx) => Promise<T>): Promise<T> {
    // Queue behind any transaction already in flight. Two overlapping BEGINs
    // against one sql.js handle would corrupt each other's rollback.
    const run = this.#lock.then(async () => {
      this.#sqlite.run('BEGIN');
      try {
        const tx: SqlTx = {
          execute: async (sql, params = []) => {
            this.#sqlite.run(sql, params as SqlValue[]);
          },
          query: async (sql, params = []) => this.#querySync(sql, params),
        };
        const result = await work(tx);
        this.#sqlite.run('COMMIT');
        this.#scheduleSave();
        return result;
      } catch (error) {
        this.#sqlite.run('ROLLBACK');
        throw error;
      }
    });

    // Keep the chain alive even when this transaction rejects, or every later
    // transaction would inherit the rejection.
    this.#lock = run.catch(() => undefined);
    return run;
  }

  #scheduleSave(): void {
    if (this.#ephemeral) return;
    if (this.#saveTimer) clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      this.#saveTimer = null;
      void this.flush();
    }, SAVE_DEBOUNCE_MS);
  }

  async flush(): Promise<void> {
    if (this.#ephemeral) return;
    if (this.#saveTimer) {
      clearTimeout(this.#saveTimer);
      this.#saveTimer = null;
    }
    // Serialise saves so two flushes cannot interleave writes to one key.
    this.#pendingSave = this.#pendingSave.then(async () => {
      const bytes = this.#sqlite.export();
      await this.#store.write(DB_KEY, await seal(this.#key, bytes));
    });
    return this.#pendingSave;
  }

  async close(): Promise<void> {
    this.#sqlite.close();
  }

  async wipe(): Promise<void> {
    if (!this.#ephemeral) await this.#store.remove(DB_KEY);
  }
}

async function resolveKey(
  store: BlobStore,
  passphrase: string | undefined,
  ephemeral: boolean,
): Promise<CryptoKey> {
  if (passphrase) {
    let salt = ephemeral ? null : await store.read(SALT_KEY);
    if (!salt) {
      salt = generateSalt();
      if (!ephemeral) await store.write(SALT_KEY, salt);
    }
    return deriveKeyFromPassphrase(passphrase, salt);
  }

  if (ephemeral) return importRawKey(generateRawKey());

  let raw = await store.read(DEVICE_KEY_KEY);
  if (!raw) {
    raw = generateRawKey();
    await store.write(DEVICE_KEY_KEY, raw);
  }
  return importRawKey(raw);
}
