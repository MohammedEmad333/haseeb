/**
 * The encrypted backup file — the only thing that crosses between a phone and
 * a desktop, since this app has no server.
 *
 * What has to hold: the file is useless without its passphrase, it carries
 * the whole ledger including the accounts, and importing it replaces the
 * receiving device rather than half-merging with it.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHaseeb, type Haseeb } from '@/db';
import { BACKUP_FORMAT, backupFilename, exportBackup, readBackup, restoreBackup } from '@/lib/backup';
import { deriveKeyFromPassphrase, generateSalt, seal } from '@/db/crypto';

let source: Haseeb;
let target: Haseeb;

const PASSPHRASE = 'كلمة-سر-النسخة';

beforeEach(async () => {
  source = await openHaseeb({ ephemeral: true });
  target = await openHaseeb({ ephemeral: true });
});

afterEach(async () => {
  await source.db.close();
  await target.db.close();
});

async function firstProduct(h: Haseeb) {
  const product = (await h.products.list()).find((p) => p.sku === 'SKU-2210');
  if (!product) throw new Error('seed product missing');
  return product;
}

describe('exporting', () => {
  it('refuses a passphrase too short to be worth anything', async () => {
    await expect(exportBackup(source.db, 'قصيرة')).rejects.toThrow();
  });

  it('reports what the file holds', async () => {
    const { manifest } = await exportBackup(source.db, PASSPHRASE);
    expect(manifest.format).toBe(BACKUP_FORMAT);
    expect(manifest.counts.products).toBe(await source.db.count('products'));
    expect(manifest.counts.staff).toBe(await source.db.count('staff'));
    expect(manifest.business).toBe((await source.ops.profile())!.name);
  });

  it('names the file in ASCII, because a browser throws away anything else', () => {
    const day = new Date().toISOString().slice(0, 10);
    // Chromium saves a non-ASCII download as «download», extension and all.
    expect(backupFilename('مؤسسة النور')).toBe(`haseeb-backup-${day}.hsb`);
    expect(backupFilename('Nour Trading Co.')).toBe(`haseeb-nour-trading-co-${day}.hsb`);
    expect(/^[\x20-\x7e]+$/.test(backupFilename('مؤسسة النور'))).toBe(true);
  });
});

describe('reading a file back', () => {
  it('needs the right passphrase', async () => {
    const { bytes } = await exportBackup(source.db, PASSPHRASE);
    await expect(readBackup(bytes, 'كلمة-سر-أخرى')).rejects.toThrow(/كلمة السر/);
  });

  it('rejects anything that is not one of our files', async () => {
    const notOurs = new TextEncoder().encode('this is a photograph, not a ledger');
    await expect(readBackup(notOurs, PASSPHRASE)).rejects.toThrow(/حسيب/);
    await expect(readBackup(new Uint8Array(4), PASSPHRASE)).rejects.toThrow(/غير مكتمل/);
  });

  it('keeps no plaintext in the file', async () => {
    const { bytes } = await exportBackup(source.db, PASSPHRASE);
    const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    expect(raw).not.toContain('SKU-2210');
    expect(raw).not.toContain('مؤسسة النور');
  });
});

describe('restoring onto another device', () => {
  it('carries the whole ledger across', async () => {
    // Something that only exists on the source device.
    const product = await firstProduct(source);
    await source.sales.checkout({
      lines: [{ productId: product.id, name: product.name, qty: 3, unit: product.price, cost: product.cost }],
      paymentMethod: 'cash',
    });

    const { bytes } = await exportBackup(source.db, PASSPHRASE);
    const manifest = await restoreBackup(target.db, bytes, PASSPHRASE);

    expect(manifest.business).toBe((await source.ops.profile())!.name);
    for (const table of ['products', 'sales', 'sale_lines', 'invoices', 'customers', 'debts', 'staff']) {
      expect(await target.db.count(table)).toBe(await source.db.count(table));
    }
    // Stock, not just row counts: the sale's effect travelled with it.
    expect((await firstProduct(target)).qtyOnHand).toBe((await firstProduct(source)).qtyOnHand);
  });

  it('replaces the receiving device rather than merging with it', async () => {
    const { bytes } = await exportBackup(source.db, PASSPHRASE);

    // The target moves on after the backup was taken.
    const product = await firstProduct(target);
    await target.sales.checkout({
      lines: [{ productId: product.id, name: product.name, qty: 1, unit: product.price, cost: product.cost }],
      paymentMethod: 'cash',
    });
    expect(await target.db.count('sales')).toBe((await source.db.count('sales')) + 1);

    await restoreBackup(target.db, bytes, PASSPHRASE);

    // The file wins outright: the target's extra sale is gone, not kept.
    expect(await target.db.count('sales')).toBe(await source.db.count('sales'));
    expect((await firstProduct(target)).qtyOnHand).toBe((await firstProduct(source)).qtyOnHand);
  });

  it('carries the accounts, so the passcodes work on the new device', async () => {
    await source.accounts.createOwner('المدير', '4826');
    const cashier = await source.accounts.createStaff({
      name: 'سارة',
      roleKey: 'cashier',
      pin: '1379',
      actor: 'المدير',
    });

    const { bytes } = await exportBackup(source.db, PASSPHRASE);
    await restoreBackup(target.db, bytes, PASSPHRASE);

    expect(await target.accounts.needsOwnerSetup()).toBe(false);
    expect(await target.accounts.signIn(cashier.id, '1379')).toMatchObject({ ok: true });
    expect(await target.accounts.signIn(cashier.id, '9999')).toMatchObject({ ok: false });
    expect((await target.accounts.byId(cashier.id))!.abilities.sort()).toEqual(
      cashier.abilities.sort(),
    );
  });

  it('records the import in the audit trail it just replaced', async () => {
    const { bytes } = await exportBackup(source.db, PASSPHRASE);
    await restoreBackup(target.db, bytes, PASSPHRASE);
    const entry = (await target.ops.audit(5))[0];
    expect(entry.description).toContain('استيراد نسخة احتياطية');
  });

  it('refuses a file written by a newer version of the app', async () => {
    const { bytes } = await exportBackup(source.db, PASSPHRASE);
    const { payload } = await readBackup(bytes, PASSPHRASE);

    const forged = await reseal({ ...payload, format: BACKUP_FORMAT + 1 });
    await expect(readBackup(forged, PASSPHRASE)).rejects.toThrow(/أحدث/);
    await expect(restoreBackup(target.db, forged, PASSPHRASE)).rejects.toThrow(/أحدث/);
  });
});

/** Re-encrypt an altered payload in the file's own layout, to test the guards
    against a file this build would never write. */
async function reseal(payload: unknown): Promise<Uint8Array> {
  const magic = new TextEncoder().encode('HSB-BACKUP-1');
  const salt = generateSalt();
  const key = await deriveKeyFromPassphrase(PASSPHRASE, salt);
  const sealed = await seal(key, new TextEncoder().encode(JSON.stringify(payload)));

  const bytes = new Uint8Array(magic.length + salt.length + sealed.length);
  bytes.set(magic, 0);
  bytes.set(salt, magic.length);
  bytes.set(sealed, magic.length + salt.length);
  return bytes;
}
