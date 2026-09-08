/**
 * The database port.
 *
 * Everything above this file speaks SQL and nothing else — no sql.js, no
 * Capacitor. That is what lets the app run a real native SQLite on a phone,
 * a WebAssembly one in a browser, and an in-memory one under test, from one
 * set of repositories.
 *
 * The port is **async**. A native SQLite driver crosses a bridge to the
 * platform, so it cannot be anything else; and even for the in-process
 * WebAssembly driver, async keeps the encrypt-and-write step off the path
 * that blocks a tap from painting.
 */

export type SqlValue = string | number | Uint8Array | null;
export type Row = Record<string, SqlValue>;

/** The read/write surface available inside a transaction. */
export interface SqlTx {
  execute(sql: string, params?: readonly SqlValue[]): Promise<void>;
  query<T extends Row = Row>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
}

export interface SqlDriver extends SqlTx {
  /** Identifies the driver in diagnostics: 'sqljs' | 'capacitor'. */
  readonly kind: string;

  /** Human-readable storage location, shown in Settings. */
  readonly location: string;

  /**
   * Run `work` inside a transaction. The driver commits when the promise
   * resolves and rolls back when it rejects, so a caller cannot leave a
   * half-applied sale behind by throwing.
   */
  transaction<T>(work: (tx: SqlTx) => Promise<T>): Promise<T>;

  /**
   * Make everything written so far durable.
   *
   * A driver whose writes are already durable (native SQLite) implements this
   * as a no-op; one that holds the database in memory (sql.js) seals and
   * writes the image here.
   */
  flush(): Promise<void>;

  close(): Promise<void>;

  /** Delete the database from storage. Used by the reset flow. */
  wipe(): Promise<void>;
}

export interface DriverOptions {
  /**
   * Owner passphrase. The native driver hands it to SQLCipher; the sql.js
   * driver derives an AES-GCM key from it. Omitted means a device key.
   */
  passphrase?: string;
  /** Skip persistence entirely — used by tests. */
  ephemeral?: boolean;
}
