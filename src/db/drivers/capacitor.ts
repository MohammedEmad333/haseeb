/**
 * The native driver: @capacitor-community/sqlite with SQLCipher.
 *
 * On a phone this replaces the WebAssembly engine with the platform's own
 * SQLite. Two things change for the better:
 *
 *  • Writes are incremental. The WebAssembly driver holds the whole database
 *    in memory and re-serialises and re-encrypts the entire image on every
 *    save, which is fine at a few hundred kilobytes and slow at twenty
 *    megabytes. Here a sale writes the pages it touched.
 *  • Encryption is SQLCipher's, keyed from a secret held in the platform
 *    secure store (Android Keystore), rather than a key file sitting beside
 *    the database.
 *
 * The two drivers implement the same port and run the same SQL, so the
 * repositories above cannot tell which one they are talking to.
 */

import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import schemaSql from '../schema.sql?raw';
import type { DriverOptions, Row, SqlDriver, SqlTx, SqlValue } from './driver';

const DATABASE = 'haseeb';
const VERSION = 1;

export class CapacitorSqliteDriver implements SqlDriver {
  readonly kind = 'capacitor';
  readonly location = 'SQLite أصلية مشفّرة (SQLCipher) على الجهاز';

  #sqlite: SQLiteConnection;
  #db: SQLiteDBConnection;
  /** Serialises transactions — SQLite has no nested BEGIN. */
  #lock: Promise<unknown> = Promise.resolve();

  private constructor(sqlite: SQLiteConnection, db: SQLiteDBConnection) {
    this.#sqlite = sqlite;
    this.#db = db;
  }

  static async open(options: DriverOptions = {}): Promise<CapacitorSqliteDriver> {
    const sqlite = new SQLiteConnection(CapacitorSQLite);

    // On the very first run there is no secret yet: generate one (or take the
    // owner's passphrase) and hand it to the platform secure store. From then
    // on the secret is already there and the app never has to hold it.
    //
    // The open mode is always 'secret'. 'encryption' is *not* the mode for
    // creating an encrypted database — it converts an existing plaintext file
    // in place, so on a fresh install it fails with "Failed in encryption …
    // not found". 'secret' creates the file encrypted, or opens one that
    // already is. (Verified on an emulator; the first attempt used
    // 'encryption' and could not open at all.)
    const { result: secretStored } = await sqlite.isSecretStored();
    if (!secretStored) {
      await sqlite.setEncryptionSecret(options.passphrase ?? generateSecret());
    }

    // A connection left behind by a previous launch would make
    // createConnection fail; closing it first makes open idempotent.
    const { result: alreadyConnected } = await sqlite.isConnection(DATABASE, false);
    if (alreadyConnected) await sqlite.closeConnection(DATABASE, false);

    const db = await sqlite.createConnection(DATABASE, true, 'secret', VERSION, false);
    await db.open();
    // Every statement is CREATE ... IF NOT EXISTS, so this is also the
    // forward-compatibility path for an existing file.
    await db.execute(schemaSql);

    return new CapacitorSqliteDriver(sqlite, db);
  }

  async execute(sql: string, params: readonly SqlValue[] = []): Promise<void> {
    await this.#db.run(sql, toValues(params), false);
  }

  async query<T extends Row = Row>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
    const result = await this.#db.query(sql, toValues(params));
    return (result.values ?? []) as T[];
  }

  async transaction<T>(work: (tx: SqlTx) => Promise<T>): Promise<T> {
    const run = this.#lock.then(async () => {
      await this.#db.beginTransaction();
      try {
        const tx: SqlTx = {
          // `transaction: false` keeps each statement inside the transaction
          // we opened rather than auto-committing it on its own.
          execute: async (sql, params = []) => {
            await this.#db.run(sql, toValues(params), false);
          },
          query: async <T extends Row = Row>(sql: string, params: readonly SqlValue[] = []) => {
            const result = await this.#db.query(sql, toValues(params));
            return (result.values ?? []) as T[];
          },
        };
        const result = await work(tx);
        await this.#db.commitTransaction();
        return result;
      } catch (error) {
        // Rolling back can itself fail if the transaction already aborted;
        // the original error is the one worth surfacing.
        await this.#db.rollbackTransaction().catch(() => undefined);
        throw error;
      }
    });

    this.#lock = run.catch(() => undefined);
    return run;
  }

  /** Native writes are already durable; there is no image to seal. */
  async flush(): Promise<void> {}

  async close(): Promise<void> {
    await this.#db.close();
    await this.#sqlite.closeConnection(DATABASE, false);
  }

  async wipe(): Promise<void> {
    await this.#db.delete();
  }
}

/**
 * The plugin's parameter binding takes plain JS values; a Uint8Array would
 * not survive the bridge, and the schema stores no blobs.
 */
function toValues(params: readonly SqlValue[]): unknown[] {
  return params.map((p) => (p instanceof Uint8Array ? Array.from(p) : p));
}

/** A 256-bit device secret, hex-encoded for the plugin's string API. */
function generateSecret(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
