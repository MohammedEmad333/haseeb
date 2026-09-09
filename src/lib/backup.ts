/**
 * Encrypted backup: moving the whole ledger between devices.
 *
 * The file is a passphrase-encrypted snapshot of every table, not a copy of
 * the database file. That matters because the two drivers store the database
 * differently — a sealed image on the web, a SQLCipher file on a phone — so a
 * file-level copy could not cross between them. Rows can.
 *
 * The passphrase is the owner's to choose and to carry: it is not stored
 * anywhere, so a backup that leaves the device is useless without it, and a
 * forgotten passphrase means a useless backup. The UI says so.
 */

import { HaseebDatabase } from '@/db/database';
import { deriveKeyFromPassphrase, generateSalt, open as openSealed, seal } from '@/db/crypto';
import { NOUNS, counted } from '@/lib/format';

/** Bumped when the table set changes in a way an older app cannot read. */
export const BACKUP_FORMAT = 1;

/** Short enough to remember, long enough that guessing it is not the attack. */
export const MIN_PASSPHRASE_LENGTH = 8;

/** Every table, parents before children so foreign keys resolve on restore. */
const TABLES = [
  'business_profile',
  'categories',
  'products',
  'customers',
  'staff',
  'permissions',
  'sales',
  'sale_lines',
  'invoices',
  'invoice_lines',
  'orders',
  'debts',
  'payments',
  'expenses',
  'stock_movements',
  'audit_log',
  'sync_queue',
  'meta',
] as const;

export interface BackupManifest {
  format: number;
  createdAt: string;
  business: string;
  /** Row counts, so the import screen can say what is in the file. */
  counts: Record<string, number>;
}

interface BackupPayload extends BackupManifest {
  tables: Record<string, Record<string, unknown>[]>;
}

const MAGIC = 'HSB-BACKUP-1';

/** Build an encrypted backup of everything in the database. */
export async function exportBackup(
  db: HaseebDatabase,
  passphrase: string,
): Promise<{ bytes: Uint8Array; manifest: BackupManifest }> {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`كلمة السر لا تقل عن ${counted(MIN_PASSPHRASE_LENGTH, NOUNS.letter)}.`);
  }

  const tables: BackupPayload['tables'] = {};
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    const rows = await db.all(`SELECT * FROM ${table}`);
    tables[table] = rows;
    counts[table] = rows.length;
  }

  const business = String(
    (await db.value('SELECT name FROM business_profile WHERE id = 1')) ?? 'حسيب',
  );

  const payload: BackupPayload = {
    format: BACKUP_FORMAT,
    createdAt: new Date().toISOString(),
    business,
    counts,
    tables,
  };

  const salt = generateSalt();
  const key = await deriveKeyFromPassphrase(passphrase, salt);
  const sealed = await seal(key, new TextEncoder().encode(JSON.stringify(payload)));

  // magic ‖ salt ‖ sealed, so the reader knows the format and can re-derive
  // the key without the salt having to travel separately.
  const header = new TextEncoder().encode(MAGIC);
  const bytes = new Uint8Array(header.length + salt.length + sealed.length);
  bytes.set(header, 0);
  bytes.set(salt, header.length);
  bytes.set(sealed, header.length + salt.length);

  const { tables: _omit, ...manifest } = payload;
  return { bytes, manifest };
}

/** Decrypt a backup and hand back what it contains, without applying it. */
export async function readBackup(
  bytes: Uint8Array,
  passphrase: string,
): Promise<{ manifest: BackupManifest; payload: BackupPayload }> {
  const header = new TextEncoder().encode(MAGIC);
  if (bytes.length < header.length + 16) throw new Error('الملف غير مكتمل.');
  for (let i = 0; i < header.length; i += 1) {
    if (bytes[i] !== header[i]) throw new Error('هذا ليس ملف نسخة احتياطية من حسيب.');
  }

  const salt = bytes.subarray(header.length, header.length + 16);
  const sealed = bytes.subarray(header.length + 16);
  const key = await deriveKeyFromPassphrase(passphrase, salt);

  let json: string;
  try {
    json = new TextDecoder().decode(await openSealed(key, sealed));
  } catch {
    throw new Error('كلمة السر غير صحيحة، أو الملف تالف.');
  }

  const payload = JSON.parse(json) as BackupPayload;
  if (payload.format > BACKUP_FORMAT) {
    throw new Error('الملف أُنشئ بنسخة أحدث من التطبيق.');
  }

  const { tables: _omit, ...manifest } = payload;
  return { manifest, payload };
}

/**
 * Replace everything in the database with the backup's contents.
 *
 * This is a restore, not a merge: the file wins entirely. Merging two ledgers
 * that both moved on is a conflict-resolution problem with no safe automatic
 * answer — two devices that each sold the last unit cannot both be right — so
 * the app does not pretend to solve it silently.
 */
export async function restoreBackup(
  db: HaseebDatabase,
  bytes: Uint8Array,
  passphrase: string,
): Promise<BackupManifest> {
  const { manifest, payload } = await readBackup(bytes, passphrase);

  await db.mutate(
    {
      entity: 'database',
      action: 'restore',
      localOnly: true,
      description: `استيراد نسخة احتياطية من «${manifest.business}» بتاريخ ${manifest.createdAt.slice(0, 10)}`,
    },
    async (tx) => {
      // Children first on the way out, parents first on the way in.
      for (const table of [...TABLES].reverse()) {
        await tx.execute(`DELETE FROM ${table}`);
      }

      for (const table of TABLES) {
        for (const row of payload.tables[table] ?? []) {
          const columns = Object.keys(row);
          if (columns.length === 0) continue;
          const placeholders = columns.map(() => '?').join(', ');
          await tx.execute(
            `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
            columns.map((c) => row[c] as string | number | null),
          );
        }
      }
    },
  );

  await db.flush();
  db.touch();
  return manifest;
}

/**
 * Suggested filename.
 *
 * ASCII only, deliberately: Chromium discards a download filename containing
 * non-ASCII characters *entirely* and saves the file as «download» with no
 * extension — which is both unrecognisable and awkward to import back. So the
 * shop's Arabic name stays out of the filename; it travels inside the file,
 * and the import screen shows it before anything is replaced.
 */
export function backupFilename(business: string): string {
  const slug = business
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .toLowerCase();
  const day = new Date().toISOString().slice(0, 10);
  return slug ? `haseeb-${slug}-${day}.hsb` : `haseeb-backup-${day}.hsb`;
}
