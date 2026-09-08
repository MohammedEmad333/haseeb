/**
 * The local database handle.
 *
 * Reads go straight to the driver. Writes run inside a transaction that also
 * appends an `audit_log` and a `sync_queue` row, so a mutation can never be
 * committed without its ledger entry — that is the whole promise of
 * «كل عملية تُسجَّل محلياً».
 */

import { openDriver, type OpenDriverOptions, type Row, type SqlDriver, type SqlTx, type SqlValue } from './drivers';

export type { Row, SqlValue } from './drivers';

export interface AuditIntent {
  entity: string;
  entityId?: string;
  action: string;
  description: string;
  actor?: string;
  payload?: unknown;
  /**
   * Skip the sync queue for changes that are local initialisation rather than
   * a business event — seeding, resetting, a display preference. They still
   * land in the audit log; they just have nothing to push to a peer.
   */
  localOnly?: boolean;
}

export type OpenOptions = OpenDriverOptions;

export class HaseebDatabase {
  #driver: SqlDriver;
  #listeners = new Set<() => void>();

  private constructor(driver: SqlDriver) {
    this.#driver = driver;
  }

  static async open(options: OpenOptions = {}): Promise<HaseebDatabase> {
    return new HaseebDatabase(await openDriver(options));
  }

  get storageLocation(): string {
    return this.#driver.location;
  }

  /** 'sqljs' on web and under test, 'capacitor' on a phone. */
  get engine(): string {
    return this.#driver.kind;
  }

  /** Whether the database already carried data when it was opened. */
  async isEmpty(): Promise<boolean> {
    return (await this.count('products')) === 0 && (await this.count('customers')) === 0;
  }

  // ---- reads ---------------------------------------------------------

  async all<T extends Row = Row>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return this.#driver.query<T>(sql, params);
  }

  async get<T extends Row = Row>(sql: string, params: SqlValue[] = []): Promise<T | null> {
    return (await this.all<T>(sql, params))[0] ?? null;
  }

  /** First column of the first row — for `SELECT COUNT(*)` and friends. */
  async value<T extends SqlValue = SqlValue>(sql: string, params: SqlValue[] = []): Promise<T | null> {
    const row = await this.get(sql, params);
    if (!row) return null;
    return Object.values(row)[0] as T;
  }

  async count(table: string): Promise<number> {
    return Number((await this.value(`SELECT COUNT(*) FROM ${table}`)) ?? 0);
  }

  // ---- writes --------------------------------------------------------

  /** Run `work` in a transaction and record it. */
  async mutate<T>(audit: AuditIntent, work: (tx: SqlTx) => Promise<T>): Promise<T> {
    const result = await this.#driver.transaction(async (tx) => {
      const value = await work(tx);
      await recordAudit(tx, audit);
      if (!audit.localOnly) await enqueueSync(tx, audit);
      return value;
    });
    this.#notify();
    return result;
  }

  /** Persist everything written so far. */
  async flush(): Promise<void> {
    return this.#driver.flush();
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
    await this.#driver.wipe();
    await this.#driver.close();
  }

  async close(): Promise<void> {
    await this.#driver.close();
  }
}

async function recordAudit(tx: SqlTx, audit: AuditIntent): Promise<void> {
  await tx.execute(
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

async function enqueueSync(tx: SqlTx, audit: AuditIntent): Promise<void> {
  // Optional encrypted sync is a queue plus a reconcile: nothing here touches
  // the network, and the app is fully usable if it never does.
  await tx.execute(
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
