/**
 * A self-test the app runs against whichever driver it actually opened.
 *
 * The native SQLite driver cannot be exercised from a developer machine or a
 * plain CI job — it only exists inside an Android or iOS WebView. So the app
 * carries its own check: on a device it opens the database, seeds it, writes
 * a sale in a transaction, reads it back, and proves a failed transaction
 * rolls all the way back.
 *
 * CI boots an emulator, installs the APK, and reads the result out of logcat.
 * That is what turns "the native driver compiles" into "the native driver
 * works" before an APK reaches anyone.
 */

import { openHaseeb } from '@/db';
import { exportBackup, readBackup } from '@/lib/backup';

export interface SelfTestResult {
  engine: string;
  passed: boolean;
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
}

export async function runDatabaseSelfTest(): Promise<SelfTestResult> {
  const checks: SelfTestResult['checks'] = [];
  const check = (name: string, ok: boolean, detail?: string): void => {
    checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
  };

  let engine = 'unknown';
  try {
    const h = await openHaseeb();
    engine = h.db.engine;

    const products = await h.products.list();
    check('seed produced a catalogue', products.length > 0, `${products.length} products`);

    const profile = await h.ops.profile();
    check('business profile readable', profile?.name === 'مؤسسة النور التجارية', profile?.name);

    const debts = await h.customers.debtTotals();
    check('debt ledger totals', debts.receivable === 1_240_000, String(debts.receivable));

    const invoices = await h.sales.invoices();
    check('month invoiced total', invoices.reduce((t, i) => t + i.total, 0) === 6_240_000);

    // A real write, through a transaction, with the stock decrement and the
    // audit row that must accompany it.
    const product = products.find((p) => p.qtyOnHand > 2);
    if (!product) {
      check('a product with stock exists', false);
    } else {
      const before = product.qtyOnHand;
      const auditBefore = (await h.ops.audit(500)).length;
      const { invoice } = await h.sales.checkout({
        lines: [
          { productId: product.id, name: product.name, qty: 1, unit: product.price, cost: product.cost },
        ],
        paymentMethod: 'cash',
      });
      const after = (await h.products.byId(product.id))!.qtyOnHand;
      check('checkout decrements stock', after === before - 1, `${before} → ${after}`);
      check('checkout writes an invoice', Boolean(await h.sales.invoiceByNo(invoice.invoiceNo)));
      check('checkout writes an audit row', (await h.ops.audit(500)).length > auditBefore);
    }

    // A transaction that throws must leave nothing behind.
    const salesBefore = (await h.sales.recentSales(500)).length;
    const stocked = (await h.products.list()).find((p) => p.qtyOnHand >= 0)!;
    try {
      await h.sales.checkout({
        lines: [
          {
            productId: stocked.id,
            name: stocked.name,
            qty: stocked.qtyOnHand + 1_000,
            unit: stocked.price,
            cost: stocked.cost,
          },
        ],
        paymentMethod: 'cash',
      });
      check('over-stock sale is refused', false, 'it was accepted');
    } catch {
      const salesAfter = (await h.sales.recentSales(500)).length;
      check('over-stock sale rolls back', salesAfter === salesBefore);
    }

    // Accounts: PBKDF2 and WebCrypto behave the same in an Android WebView as
    // in a browser, but the passcode is the thing that stands between a shop
    // and its books, so the device says so itself rather than being trusted.
    const { account: owner } = await h.accounts.createOwner('المدير', '4826');
    check('owner account created', owner.isOwner && owner.hasPin);
    check('right passcode signs in', (await h.accounts.signIn(owner.id, '4826')).ok);
    check('wrong passcode is refused', !(await h.accounts.signIn(owner.id, '9999')).ok);

    const staff = await h.accounts.createStaff({
      name: 'كاشير الاختبار',
      roleKey: 'cashier',
      pin: '1379',
      actor: 'المدير',
    });
    check(
      'employee holds only its own abilities',
      staff.abilities.includes('pos.sell') && !staff.abilities.includes('finance.read'),
      staff.abilities.join(','),
    );

    // The backup is a row-level snapshot, so it exercises every table through
    // this driver in one go.
    const { bytes, manifest } = await exportBackup(h.db, 'كلمة-سر-الاختبار');
    check('backup covers the catalogue', manifest.counts.products === products.length);
    const reread = await readBackup(bytes, 'كلمة-سر-الاختبار');
    check('backup reads back', reread.manifest.business === profile?.name);
    let refused = false;
    try {
      await readBackup(bytes, 'كلمة-سر-خاطئة');
    } catch {
      refused = true;
    }
    check('backup refuses a wrong passphrase', refused);

    await h.db.flush();

    // Reopen: on the native driver this proves the file on disk is real and
    // decryptable, not just an in-memory image.
    await h.db.close();
    const reopened = await openHaseeb();
    check('reopen finds the data', (await reopened.products.list()).length === products.length);
    await reopened.db.close();
  } catch (cause) {
    check('self-test ran to completion', false, cause instanceof Error ? cause.message : String(cause));
  }

  return { engine, passed: checks.every((c) => c.ok), checks };
}

/**
 * Run the self-test and print a single line CI can grep for.
 *
 * Triggered either by `?selftest=1` (convenient in a browser) or by building
 * with `VITE_HASEEB_SELFTEST=1`. The build flag is what CI uses on a device:
 * Capacitor's activity has no intent filter for an arbitrary URL, so a query
 * string cannot be handed to it from `adb`.
 */
export function maybeRunSelfTest(): boolean {
  const viaFlag = import.meta.env.VITE_HASEEB_SELFTEST === '1';
  const search = typeof location === 'undefined' ? '' : location.search;
  const viaQuery = new URLSearchParams(search).has('selftest');
  if (!viaFlag && !viaQuery) return false;

  void runDatabaseSelfTest().then((result) => {
    for (const c of result.checks) {
      console.log(`HASEEB_SELFTEST_CHECK ${c.ok ? 'PASS' : 'FAIL'} ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
    }
    console.log(`HASEEB_SELFTEST_RESULT ${result.passed ? 'PASS' : 'FAIL'} engine=${result.engine}`);
    // Surface it in the DOM too, so a UI-driven runner can read it without
    // scraping logs.
    const el = document.createElement('div');
    el.id = 'haseeb-selftest';
    el.dataset.result = result.passed ? 'PASS' : 'FAIL';
    el.dataset.engine = result.engine;
    el.textContent = JSON.stringify(result);
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0F172A;color:#F8FAFC;padding:16px;font:12px monospace;overflow:auto';
    document.body.append(el);
  });

  return true;
}
