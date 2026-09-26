import { describe, expect, it } from 'vitest';
import { loadSqlJs } from '@/db/engine';
import { CURRENT_SCHEMA_VERSION, runSchemaMigrations } from '@/db/migrations';
import type { Row, SqlTx, SqlValue } from '@/db/drivers';

describe('schema migrations', () => {
  it('adds expense payment method to an existing database and defaults old rows to cash', async () => {
    const SQL = await loadSqlJs();
    const sqlite = new SQL.Database();
    sqlite.run(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE expenses (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        amount_piasters INTEGER NOT NULL,
        color TEXT NOT NULL DEFAULT '#0F172A',
        period TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );
      INSERT INTO expenses (id, label, amount_piasters, color, period, recorded_at)
      VALUES ('old-expense', 'قديم', 500, '#0F172A', '2026-09', '2026-09-01T00:00:00.000Z');
    `);

    const db: SqlTx = {
      execute: async (sql, params = []) => {
        sqlite.run(sql, params as SqlValue[]);
      },
      query: async <T extends Row = Row>(sql: string, params: readonly SqlValue[] = []) => {
        const statement = sqlite.prepare(sql);
        try {
          statement.bind(params as SqlValue[]);
          const rows: T[] = [];
          while (statement.step()) rows.push(statement.getAsObject() as T);
          return rows;
        } finally {
          statement.free();
        }
      },
    };

    await runSchemaMigrations(db);
    await runSchemaMigrations(db);

    const columns = await db.query('PRAGMA table_info(expenses)');
    expect(columns.some((row) => String(row.name) === 'payment_method')).toBe(true);

    const expense = (await db.query('SELECT payment_method FROM expenses WHERE id = ?', ['old-expense']))[0];
    expect(expense.payment_method).toBe('cash');

    const version = (await db.query('SELECT value FROM meta WHERE key = ?', ['schema.version']))[0];
    expect(Number(version.value)).toBe(CURRENT_SCHEMA_VERSION);

    sqlite.close();
  });
});
