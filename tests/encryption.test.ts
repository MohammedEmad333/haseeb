/**
 * The database file must be unreadable without its key, and must survive a
 * close and reopen with every row intact.
 */

import { describe, expect, it } from 'vitest';
import { HaseebDatabase } from '@/db/database';
import { MemoryStore } from '@/db/storage';
import { openHaseeb, seed } from '@/db';
import { buildTaxQrPayload } from '@/lib/zatca';
import { toMsisdn, whatsappHref } from '@/lib/reminders';

describe('encryption at rest', () => {
  it('writes a sealed image that contains no plaintext', async () => {
    const store = new MemoryStore();
    const db = await HaseebDatabase.open({ store, passphrase: 'كلمة-سر-قوية' });
    seed(db);
    await db.flush();
    db.close();

    const bytes = await store.read('haseeb.db');
    expect(bytes).not.toBeNull();

    // The seeded business name and SQLite's own file header both appear in a
    // plain image; neither may survive sealing.
    const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes!);
    expect(raw).not.toContain('SQLite format 3');
    expect(raw).not.toContain('مؤسسة النور');
    expect(raw).not.toContain('SKU-1042');
  });

  it('reopens with the right passphrase and reads every row back', async () => {
    const store = new MemoryStore();
    const first = await HaseebDatabase.open({ store, passphrase: 'كلمة-سر-قوية' });
    seed(first);
    const productCount = first.count('products');
    await first.flush();
    first.close();

    const second = await HaseebDatabase.open({ store, passphrase: 'كلمة-سر-قوية' });
    expect(second.count('products')).toBe(productCount);
    expect(second.get('SELECT name FROM business_profile WHERE id = 1')?.name).toBe(
      'مؤسسة النور التجارية',
    );
    second.close();
  });

  it('refuses a wrong passphrase', async () => {
    const store = new MemoryStore();
    const db = await HaseebDatabase.open({ store, passphrase: 'الصحيحة' });
    seed(db);
    await db.flush();
    db.close();

    await expect(HaseebDatabase.open({ store, passphrase: 'الخاطئة' })).rejects.toThrow();
  });

  it('detects a tampered file rather than opening it', async () => {
    const store = new MemoryStore();
    const db = await HaseebDatabase.open({ store, passphrase: 'كلمة-سر' });
    seed(db);
    await db.flush();
    db.close();

    const bytes = (await store.read('haseeb.db'))!;
    // Flip a bit deep inside the ciphertext: GCM authentication must catch it.
    bytes[bytes.length - 40] ^= 0x01;
    await store.write('haseeb.db', bytes);

    await expect(HaseebDatabase.open({ store, passphrase: 'كلمة-سر' })).rejects.toThrow();
  });

  it('persists a sale made after the seed', async () => {
    const store = new MemoryStore();
    const h = await openHaseeb({ store });
    const product = h.products.list()[0];
    const { invoice } = h.sales.checkout({
      lines: [{ productId: product.id, name: product.name, qty: 1, unit: product.price, cost: product.cost }],
      paymentMethod: 'cash',
    });
    await h.db.flush();
    h.db.close();

    const reopened = await openHaseeb({ store });
    expect(reopened.sales.invoiceByNo(invoice.invoiceNo)).not.toBeNull();
    reopened.db.close();
  });
});

describe('tax QR', () => {
  it('encodes the five required fields as base64 TLV', () => {
    const payload = buildTaxQrPayload({
      sellerName: 'مؤسسة النور التجارية',
      vatNumber: '302199487',
      timestamp: '2026-09-08T09:41:00.000Z',
      total: '1413.60',
      vat: '173.60',
    });

    const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
    // Tag 1, then a length byte, then that many bytes of the seller name.
    expect(bytes[0]).toBe(1);
    const nameLength = bytes[1];
    expect(new TextDecoder().decode(bytes.subarray(2, 2 + nameLength))).toBe(
      'مؤسسة النور التجارية',
    );
    // The next block is tag 2, the VAT registration number.
    expect(bytes[2 + nameLength]).toBe(2);
  });
});

describe('reminder deep links', () => {
  it('converts local Egyptian numbers to international form', () => {
    expect(toMsisdn('01022223344')).toBe('201022223344');
    expect(toMsisdn('+20 102 222 3344')).toBe('201022223344');
    expect(toMsisdn('0020 102 222 3344')).toBe('201022223344');
  });

  it('builds an encoded WhatsApp link', () => {
    const href = whatsappHref('01022223344', 'تذكير بالسداد');
    expect(href.startsWith('https://wa.me/201022223344?text=')).toBe(true);
    expect(href).not.toContain(' ');
  });
});
