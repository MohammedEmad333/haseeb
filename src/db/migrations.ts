import type { Row, SqlTx } from './drivers';

export const CURRENT_SCHEMA_VERSION = 1;
const VERSION_KEY = 'schema.version';

/**
 * Forward-only schema upgrades for databases created by older Haseeb builds.
 *
 * schema.sql creates fresh databases at the latest shape. These migrations
 * cover existing files, where CREATE TABLE IF NOT EXISTS cannot add columns.
 */
export async function runSchemaMigrations(db: SqlTx): Promise<void> {
  const rows = await db.query<Row>('SELECT value FROM meta WHERE key = ?', [VERSION_KEY]);
  let version = Number(rows[0]?.value ?? 0);
  if (!Number.isInteger(version) || version < 0) version = 0;

  if (version < 1) {
    await ensureColumn(
      db,
      'expenses',
      'payment_method',
      "TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','card','wallet'))",
    );
    version = 1;
    await db.execute(
      'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
      [VERSION_KEY, String(version)],
    );
  }

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error('قاعدة البيانات أُنشئت بنسخة أحدث من حسيب.');
  }
}

async function ensureColumn(
  db: SqlTx,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const columns = await db.query<Row>(`PRAGMA table_info(${table})`);
  if (columns.some((row) => String(row.name) === column)) return;
  await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
