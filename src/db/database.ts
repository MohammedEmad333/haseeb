/**
 * The local database handle: an open SQLite image plus the encryption and
 * persistence around it.
 *
 * Reads go straight to SQLite. Writes run inside a transaction, append an
 * `audit_log` and a `sync_queue` row, and schedule a debounced re-seal of
 * the image to storage — a save per keystroke would be pointless churn, and
 * a save only on close would lose work to a killed tab.
 */

import schemaSql from './schema.sql?raw';
import { loadSqlJs, type SqlJsDatabase } from './engine';
import { createBlobStore, type BlobStore } from './storage';
import {
  generateRawKey,
  generateSalt,
  importRawKey,
  deriveKeyFromPassphrase,
  open as openSealed,
  seal,
} from './crypto';

const DB_KEY = 'haseeb.db';
const DEVICE_KEY_KEY = 'haseeb.devicekey';
const SALT_KEY = 'haseeb.salt';
const SAVE_DEBOUNCE_MS = 400;

export type SqlValue = string | number | Uint8Array | null;
export type Row = Record<string, SqlValue>;

export interface AuditIntent {
  entity: string;
  entityId?: string;
  action: string;
  description: string;
  actor?: string;
  payload?: unknown;
}

export interface OpenOptions {
  /** Owner passphrase. When omitted, a random device key is used instead. */
  passphrase?: string;
  store?: BlobStore;
  /** Skip persistence entirely — used by tests. */
  ephemeral?: boolean;
}

export class HaseebDatabase {
  #sqlite: SqlJsDatabase;
  #key: CryptoKey;
  #store: BlobStore;
  #ephemeral: boolean;
  #saveTimer: ReturnType<typeof setTimeout> | null = null;
  #pendingSave: Promise<void> | null = null;
  #listeners = new Set<() => void>();

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

  static async open(options: OpenOptions = {}): Promise<HaseebDatabase> {
    const store = options.store ?? createBlobStore();
    const ephemeral = options.ephemeral ?? false;
    const SQL = await loadSqlJs();

    const key = await resolveKey(store, options.passphrase, ephemeral);
    const sealed = ephemeral ? null : await store.read(DB_KEY);

    let sqlite: SqlJsDatabase;
    if (sealed) {
      sqlite = new SQL.Database(await openSealed(key, sealed));
    } else {
      sqlite = new SQL.Database();
    }
    // Applying the schema on every open keeps an existing file forward
    // compatible; every statement is CREATE ... IF NOT EXISTS.
    sqlite.run(schemaSql);

    const db = new HaseebDatabase(sqlite, key, store, ephemeral);
    if (!sealed) await db.flush();
    return db;
  }

  get storageLocation(): string {
    return this.#ephemeral ? 'ذاكرة مؤقتة (بدون حفظ)' : this.#store.describe();
  }

  /** Whether the file already carried data when it was opened. */
  isEmpty(): boolean {
    return this.count('products') === 0 && this.count('customers') === 0;
  }

  // ---- reads ---------------------------------------------------------

  all<T extends Row = Row>(sql: string, params: SqlValue[] = []): T[] {
    const statement = this.#sqlite.prepare(sql);
    try {
      statement.bind(params);
      const rows: T[] = [];
      while (statement.step()) rows.push(statement.getAsObject() as T);
      return rows;
    } finally {
      statement.free();
    }
  }

  get<T extends Row = Row>(sql: string, params: SqlValue[] = []): T | null {
    return this.all<T>(sql, params)[0] ?? null;
  }

  /** First column of the first row — for `SELECT COUNT(*)` and friends. */
  value<T extends SqlValue = SqlValue>(sql: string, params: SqlValue[] = []): T | null {
    const row = this.get(sql, params);
    if (!row) return null;
    return Object.values(row)[0] as T;
  }

  count(table: string): number {
    return Number(this.value(`SELECT COUNT(*) FROM ${table}`) ?? 0);
  }

  // ---- writes --------------------------------------------------------

  /**
   * Run `work` in a transaction and record it.
   *
   * The audit row is written inside the same transaction as the change, so a
   * mutation can never be committed without its ledger entry — that is the
   * whole promise of «كل عملية تُسجَّل محلياً».
   */
  mutate<T>(audit: AuditIntent, work: (db: HaseebDatabase) => T): T {
    this.#sqlite.run('BEGIN');
    try {
      const result = work(this);
      this.#recordAudit(audit);
      this.#enqueueSync(audit);
      this.#sqlite.run('COMMIT');
      this.#scheduleSave();
      this.#notify();
      return result;
    } catch (error) {
      this.#sqlite.run('ROLLBACK');
      throw error;
    }
  }

  /** Raw statement execution, only valid inside `mutate`. */
  run(sql: string, params: SqlValue[] = []): void {
    this.#sqlite.run(sql, params);
  }

  #recordAudit(audit: AuditIntent): void {
    this.#sqlite.run(
      `INSERT INTO audit_log (id, entity, entity_id, action, description, actor, payload, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        audit.entity,
        audit.entityId ?? '',
        audit.action,
        audit.description,
        audit.actor ?? 'المدير',
        audit.payload === undefined ? '' : JSON.stringify(audit.payload),
        nowIso(),
      ],
    );
  }

  #enqueueSync(audit: AuditIntent): void {
    // Optional encrypted sync is a queue plus a reconcile: nothing here
    // touches the network, and the app is fully usable if it never does.
    this.#sqlite.run(
      `INSERT INTO sync_queue (id, entity, entity_id, action, payload, queued_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      [
        newId(),
        audit.entity,
        audit.entityId ?? '',
        audit.action,
        audit.payload === undefined ? '' : JSON.stringify(audit.payload),
        nowIso(),
      ],
    );
  }

  // ---- persistence ---------------------------------------------------

  #scheduleSave(): void {
    if (this.#ephemeral) return;
    if (this.#saveTimer) clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      this.#saveTimer = null;
      void this.flush();
    }, SAVE_DEBOUNCE_MS);
  }

  /** Seal and write the current image immediately. */
  async flush(): Promise<void> {
    if (this.#ephemeral) return;
    if (this.#saveTimer) {
      clearTimeout(this.#saveTimer);
      this.#saveTimer = null;
    }
    // Serialise saves so two flushes cannot interleave writes to one key.
    this.#pendingSave = (this.#pendingSave ?? Promise.resolve()).then(async () => {
      const bytes = this.#sqlite.export();
      await this.#store.write(DB_KEY, await seal(this.#key, bytes));
    });
    return this.#pendingSave;
  }

  // ---- change notification -------------------------------------------

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }

  /** Announce a change made outside `mutate` (seeding, reset). */
  touch(): void {
    this.#notify();
  }

  // ---- lifecycle -----------------------------------------------------

  async destroy(): Promise<void> {
    this.#sqlite.close();
    if (!this.#ephemeral) {
      await this.#store.remove(DB_KEY);
    }
  }

  close(): void {
    this.#sqlite.close();
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

/** UUID v4 where available, with a random fallback for older WebViews. */
export function newId(): string {
  const c: Crypto = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
