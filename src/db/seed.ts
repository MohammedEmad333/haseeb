/**
 * First-run seed data.
 *
 * Every row the design specifies literally — the product catalogue with its
 * SKUs, costs, prices and on-hand quantities; the six named invoices; the
 * debt ledger down to محمود عبد الله's individual payments; the orders,
 * expenses, staff, audit entries and stock movements — is reproduced exactly,
 * so a fresh install renders the designed screens rather than empty states.
 *
 * Dates are anchored to «اليوم» instead of being hard-coded, so the seven-day
 * chart, the debt aging and the sales log stay coherent whenever the app is
 * first opened.
 *
 * Two notes on fidelity, both deliberate:
 *
 *  • Historical sales are imported the way a real migration imports them —
 *    header totals as stated, illustrative lines, and *no* stock movement,
 *    because the on-hand quantities in the design are already the closing
 *    figures. Only today's sales move stock.
 *  • The design's aggregate tiles were authored per-tile and do not reconcile
 *    with each other (its net-profit tile is 6,000 ج.م away from its own
 *    gross-profit minus expenses, and its six invoices do not sum to its
 *    weekly sales). Aggregates here are computed from this ledger rather than
 *    hard-coded, so the dashboard can never contradict the books. See README.
 */

import { HaseebDatabase, newId, nowIso } from './database';
import type { SqlTx } from './drivers';

/** Pounds → piasters. */
const P = (pounds: number): number => Math.round(pounds * 100);

/** VAT split for an amount that already includes 14% tax. */
function splitVatInclusive(total: number, rate = 14): { subtotal: number; vat: number } {
  const vat = Math.round((total * rate) / (100 + rate));
  return { subtotal: total - vat, vat };
}

function at(daysAgo: number, hour = 12, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { id: 'cat-grocery', name: 'بقالة', position: 1 },
  { id: 'cat-drinks', name: 'مشروبات', position: 2 },
  { id: 'cat-dairy', name: 'ألبان', position: 3 },
  { id: 'cat-cleaning', name: 'منظفات', position: 4 },
];

interface SeedProduct {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  cost: number;
  price: number;
  qty: number;
}

/** Exactly the design's stock table, in its order. */
const PRODUCTS: SeedProduct[] = [
  { id: 'prd-rice', sku: 'SKU-1042', barcode: '6221031001042', name: 'أرز أبو كاس ١كجم', category: 'cat-grocery', cost: 26.0, price: 32.0, qty: 48 },
  { id: 'prd-oil', sku: 'SKU-2210', barcode: '6221031002210', name: 'زيت عافية ٨٠٠مل', category: 'cat-grocery', cost: 64.0, price: 74.5, qty: 12 },
  { id: 'prd-milk', sku: 'SKU-3388', barcode: '6221031003388', name: 'لبن جهينة ١لتر', category: 'cat-dairy', cost: 31.0, price: 38.0, qty: 7 },
  { id: 'prd-tea', sku: 'SKU-1177', barcode: '6221031001177', name: 'شاي العروسة ٢٥٠جم', category: 'cat-drinks', cost: 38.0, price: 45.0, qty: 22 },
  { id: 'prd-pasta', sku: 'SKU-4501', barcode: '6221031004501', name: 'مكرونة قمحي ٤٠٠جم', category: 'cat-grocery', cost: 11.5, price: 14.75, qty: 90 },
  { id: 'prd-cheese', sku: 'SKU-3390', barcode: '6221031003390', name: 'جبنة بيضاء ٥٠٠جم', category: 'cat-dairy', cost: 47.0, price: 56.0, qty: 16 },
  { id: 'prd-water', sku: 'SKU-5020', barcode: '6221031005020', name: 'مياه معدنية ١.٥لتر', category: 'cat-drinks', cost: 7.25, price: 10.0, qty: 120 },
  { id: 'prd-sugar', sku: 'SKU-1080', barcode: '6221031001080', name: 'سكر ناعم ١كجم', category: 'cat-grocery', cost: 23.0, price: 28.0, qty: 60 },
];

const BY_SKU = new Map(PRODUCTS.map((p) => [p.sku, p]));
const product = (sku: string): SeedProduct => {
  const p = BY_SKU.get(sku);
  if (!p) throw new Error(`seed references unknown SKU ${sku}`);
  return p;
};

interface SeedCustomer {
  id: string;
  name: string;
  kind: 'retail' | 'wholesale' | 'supplier';
  phone: string;
  city: string;
  tier: 'silver' | 'gold' | 'platinum' | null;
  moq: number;
  since: number;
}

const CUSTOMERS: SeedCustomer[] = [
  { id: 'cus-ahmed', name: 'أحمد سعيد', kind: 'retail', phone: '01066554433', city: 'المنصورة', tier: null, moq: 0, since: 2024 },
  { id: 'cus-mahmoud', name: 'محمود عبد الله', kind: 'retail', phone: '01022223344', city: 'المنصورة', tier: null, moq: 0, since: 2024 },
  { id: 'cus-sayed', name: 'سيد رمضان', kind: 'retail', phone: '01155556677', city: 'طلخا', tier: null, moq: 0, since: 2023 },
  { id: 'cus-fatma', name: 'فاطمة الزهراء', kind: 'retail', phone: '01099998877', city: 'المنصورة', tier: null, moq: 0, since: 2025 },
  { id: 'cus-hoda', name: 'مخبز الهدى', kind: 'wholesale', phone: '01233334455', city: 'المنصورة', tier: 'gold', moq: 100, since: 2022 },
  { id: 'cus-safa', name: 'سوبرماركت الصفا', kind: 'wholesale', phone: '01277776655', city: 'طنطا', tier: 'platinum', moq: 250, since: 2021 },
  { id: 'cus-nile', name: 'بقالة النيل', kind: 'wholesale', phone: '01288887766', city: 'المحلة', tier: 'silver', moq: 50, since: 2023 },
  { id: 'cus-rokn', name: 'كافيه الركن', kind: 'wholesale', phone: '01144443322', city: 'المنصورة', tier: 'silver', moq: 60, since: 2024 },
  { id: 'cus-nasr', name: 'ورشة النصر', kind: 'wholesale', phone: '01011112233', city: 'دمياط', tier: 'gold', moq: 80, since: 2022 },
  { id: 'sup-sharq', name: 'الشرق للتوزيع', kind: 'supplier', phone: '01500001111', city: 'القاهرة', tier: null, moq: 0, since: 2021 },
  { id: 'sup-delta', name: 'ألبان الدلتا', kind: 'supplier', phone: '01500002222', city: 'المنصورة', tier: null, moq: 0, since: 2022 },
  { id: 'sup-ahram', name: 'الأهرام للمواد الغذائية', kind: 'supplier', phone: '01500003333', city: 'طنطا', tier: null, moq: 0, since: 2023 },
  { id: 'sup-nour', name: 'النور للتغليف', kind: 'supplier', phone: '01500004444', city: 'المنصورة', tier: null, moq: 0, since: 2024 },
];

/** Additional retail customers, so the debt ledger carries the design's 18. */
const EXTRA_DEBTORS: Array<{ name: string; phone: string; owed: number; dueDaysAgo: number; lastPaidDaysAgo: number }> = [
  { name: 'عماد شوقي', phone: '01023456789', owed: 410, dueDaysAgo: -9, lastPaidDaysAgo: 9 },
  { name: 'هالة سمير', phone: '01198765432', owed: 260, dueDaysAgo: -12, lastPaidDaysAgo: 14 },
  { name: 'كريم فؤاد', phone: '01234567890', owed: 320, dueDaysAgo: 3, lastPaidDaysAgo: 21 },
  { name: 'منى صابر', phone: '01087654321', owed: 180, dueDaysAgo: -5, lastPaidDaysAgo: 6 },
  { name: 'أشرف زكي', phone: '01111222333', owed: 140, dueDaysAgo: -18, lastPaidDaysAgo: 11 },
  { name: 'نبيلة فتحي', phone: '01222333444', owed: 150, dueDaysAgo: -2, lastPaidDaysAgo: 3 },
  { name: 'حسن الديب', phone: '01033344455', owed: 175, dueDaysAgo: 7, lastPaidDaysAgo: 25 },
  { name: 'سماح رشدي', phone: '01144455566', owed: 195, dueDaysAgo: -14, lastPaidDaysAgo: 8 },
  { name: 'محمد الجندي', phone: '01255566677', owed: 130, dueDaysAgo: -21, lastPaidDaysAgo: 16 },
  { name: 'إيمان لطفي', phone: '01066677788', owed: 210, dueDaysAgo: -4, lastPaidDaysAgo: 5 },
  { name: 'وليد عابدين', phone: '01177788899', owed: 165, dueDaysAgo: 1, lastPaidDaysAgo: 19 },
  { name: 'رانيا سليم', phone: '01288899900', owed: 145, dueDaysAgo: -7, lastPaidDaysAgo: 4 },
  { name: 'جمال الشناوي', phone: '01099911122', owed: 170, dueDaysAgo: -25, lastPaidDaysAgo: 13 },
];

/**
 * Settlements received this month. Amounts and count are the design's
 * «٩,٦٤٠ · ٢٣ سداداً» once the nine already implied by the balances above
 * are included.
 */
const COLLECTIONS: Array<[string, number, string, number]> = [
  ['cus-extra-1', 520, 'cash', 0],
  ['cus-extra-2', 480, 'wallet', 1],
  ['cus-extra-3', 450, 'cash', 1],
  ['cus-extra-4', 430, 'transfer', 2],
  ['cus-extra-5', 410, 'cash', 2],
  ['cus-extra-6', 390, 'card', 3],
  ['cus-extra-7', 370, 'cash', 3],
  ['cus-extra-8', 350, 'wallet', 4],
  ['cus-extra-9', 330, 'cash', 4],
  ['cus-extra-10', 310, 'transfer', 5],
  ['cus-extra-11', 290, 'cash', 5],
  ['cus-extra-12', 270, 'wallet', 6],
  ['cus-extra-13', 250, 'cash', 6],
  ['cus-nile', 480, 'card', 7],
];

const EXPENSES = [
  { label: 'إيجار المحل', amount: 4000, color: '#0F172A' },
  { label: 'رواتب الموظفين', amount: 3200, color: '#059669' },
  { label: 'كهرباء ومياه', amount: 1050, color: '#10B981' },
  { label: 'نقل وتوصيل', amount: 780, color: '#F59E0B' },
  { label: 'صيانة ومتنوعة', amount: 450, color: '#CBD5E1' },
];

const STAFF = [
  { id: 'stf-nada', name: 'ندى مصطفى', role: 'كاشير — وردية صباحية', scope: 'بيع فقط', active: true, abilities: ['pos.sell'] },
  { id: 'stf-tarek', name: 'طارق حسن', role: 'أمين مخزن', scope: 'مخزن + توريد', active: true, abilities: ['inventory.read', 'inventory.write', 'orders.receive'] },
  { id: 'stf-sara', name: 'سارة عادل', role: 'محاسبة', scope: 'تقارير مالية', active: true, abilities: ['finance.read', 'invoices.write'] },
  { id: 'stf-youssef', name: 'يوسف كامل', role: 'مندوب جملة', scope: 'موقوف', active: false, abilities: [] },
];

/**
 * The six invoices the design names, newest first. `total` is the amount as
 * printed on the invoice (VAT included); `profit` is the gross profit the
 * design states for the row.
 */
interface NamedInvoice {
  no: string;
  customer: string;
  daysAgo: number;
  hour: number;
  minute: number;
  total: number;
  profit: number;
  status: 'paid' | 'pending' | 'overdue';
  kind: 'retail' | 'wholesale';
  channel: 'retail' | 'wholesale' | 'preorder' | 'other';
  method: 'cash' | 'wallet' | 'card' | 'credit';
  lines: Array<{ sku: string; qty: number }>;
}

const NAMED_INVOICES: NamedInvoice[] = [
  {
    no: 'INV-2481', customer: 'cus-ahmed', daysAgo: 0, hour: 9, minute: 41,
    total: 1413.6, profit: 310.2, status: 'paid', kind: 'retail', channel: 'retail', method: 'cash',
    // The printed tax invoice is the one document that must reconcile to the
    // piaster, so these lines are solved to sum to exactly 1,240.00:
    //   74.50×2 + 32.00×5 + 45.00×4 + 14.75×36 + 10.00×22 = 1,240.00
    // and 1,240.00 + 14% VAT = 1,413.60, the total the design prints.
    lines: [
      { sku: 'SKU-2210', qty: 2 },
      { sku: 'SKU-1042', qty: 5 },
      { sku: 'SKU-1177', qty: 4 },
      { sku: 'SKU-4501', qty: 36 },
      { sku: 'SKU-5020', qty: 22 },
    ],
  },
  {
    no: 'INV-2480', customer: 'cus-hoda', daysAgo: 1, hour: 16, minute: 20,
    total: 4280.0, profit: 740.0, status: 'pending', kind: 'wholesale', channel: 'wholesale', method: 'credit',
    lines: [{ sku: 'SKU-4501', qty: 120 }, { sku: 'SKU-1080', qty: 40 }, { sku: 'SKU-5020', qty: 80 }],
  },
  {
    no: 'INV-2479', customer: 'cus-mahmoud', daysAgo: 3, hour: 12, minute: 15,
    total: 1450.0, profit: 280.0, status: 'overdue', kind: 'retail', channel: 'retail', method: 'credit',
    lines: [{ sku: 'SKU-2210', qty: 8 }, { sku: 'SKU-1042', qty: 10 }],
  },
  {
    no: 'INV-2478', customer: 'cus-safa', daysAgo: 4, hour: 10, minute: 5,
    total: 9120.0, profit: 1340.0, status: 'paid', kind: 'wholesale', channel: 'wholesale', method: 'card',
    lines: [{ sku: 'SKU-1042', qty: 150 }, { sku: 'SKU-5020', qty: 200 }, { sku: 'SKU-4501', qty: 100 }],
  },
  {
    no: 'INV-2477', customer: 'cus-rokn', daysAgo: 5, hour: 13, minute: 30,
    total: 2670.5, profit: 490.3, status: 'paid', kind: 'wholesale', channel: 'preorder', method: 'cash',
    lines: [{ sku: 'SKU-5020', qty: 140 }, { sku: 'SKU-1177', qty: 20 }],
  },
  {
    no: 'INV-2476', customer: 'cus-nasr', daysAgo: 6, hour: 11, minute: 20,
    total: 840.0, profit: 160.0, status: 'pending', kind: 'wholesale', channel: 'wholesale', method: 'credit',
    lines: [{ sku: 'SKU-4501', qty: 30 }, { sku: 'SKU-5020', qty: 40 }],
  },
];

/**
 * Today's live sales log, exactly as the design lists it — five separate
 * tickets rung up this morning. These are the only seeded sales that move
 * stock, because the catalogue quantities are already the closing figures.
 */
const TODAY_TICKETS: Array<{
  hour: number; minute: number; sku: string; qty: number;
  method: 'cash' | 'wallet' | 'card' | 'credit'; customer: string | null;
}> = [
  { hour: 9, minute: 41, sku: 'SKU-2210', qty: 2, method: 'cash', customer: null },
  { hour: 9, minute: 36, sku: 'SKU-1042', qty: 5, method: 'wallet', customer: null },
  { hour: 9, minute: 28, sku: 'SKU-1177', qty: 1, method: 'card', customer: null },
  { hour: 9, minute: 14, sku: 'SKU-3388', qty: 3, method: 'credit', customer: 'cus-sayed' },
  { hour: 8, minute: 59, sku: 'SKU-5020', qty: 6, method: 'cash', customer: null },
];

/** «٤٨ فاتورة في الفترة» — the rest of the month's invoices, oldest-first. */
const MONTH_INVOICE_COUNT = 48;
const MONTH_INVOICED_TOTAL = 62_400; // ج.م, the design's «مبلغ الفواتير»

const ORDERS: Array<[string, 'customer' | 'supplier', string, string, string, string, number, number, number, number]> = [
  ['ORD-882', 'customer', 'cus-ahmed', 'أحمد سعيد', 'completed', 'تسليم بالمحل', 3, 1413.6, 0, 9],
  ['ORD-881', 'customer', 'cus-hoda', 'مخبز الهدى', 'preparing', 'توصيل', 8, 4280.0, 1, 16],
  ['ORD-880', 'customer', 'cus-safa', 'سوبرماركت الصفا', 'completed', 'توصيل', 14, 9120.0, 4, 10],
  ['PO-311', 'supplier', 'sup-sharq', 'الشرق للتوزيع', 'received', 'زيت · سكر · شاي', 3, 12400.0, 2, 8],
  ['PO-310', 'supplier', 'sup-delta', 'ألبان الدلتا', 'awaitingShipment', 'لبن · جبنة', 2, 6750.0, 3, 11],
  ['ORD-879', 'customer', 'cus-rokn', 'كافيه الركن', 'cancelled', 'تسليم بالمحل', 5, 680.0, 5, 13],
];

/** The design's stock-movement timeline, newest first. */
const MOVEMENTS: Array<{
  sku: string; kind: 'purchase' | 'sale' | 'return' | 'adjustment'; delta: number;
  actor: string; counterparty: string; daysAgo: number; hour: number; minute: number;
}> = [
  { sku: 'SKU-2210', kind: 'purchase', delta: 60, actor: '', counterparty: 'الشرق للتوزيع', daysAgo: 0, hour: 8, minute: 20 },
  { sku: 'SKU-1042', kind: 'sale', delta: -5, actor: 'ندى', counterparty: '', daysAgo: 0, hour: 9, minute: 36 },
  { sku: 'SKU-3390', kind: 'return', delta: 2, actor: '', counterparty: 'سيد رمضان', daysAgo: 1, hour: 17, minute: 4 },
  { sku: 'SKU-3388', kind: 'adjustment', delta: -3, actor: 'المدير', counterparty: '', daysAgo: 1, hour: 21, minute: 10 },
  { sku: 'SKU-4501', kind: 'sale', delta: -120, actor: '', counterparty: 'مخبز الهدى', daysAgo: 2, hour: 11, minute: 45 },
];

/** The design's audit trail, newest first. */
const AUDIT_HISTORY: Array<[string, string, number, number, number]> = [
  ['تعديل سعر بيع «زيت عافية ٨٠٠مل» من ٧٢.٠٠ إلى ٧٤.٥٠', 'المدير', 0, 8, 51],
  ['حذف سطر من فاتورة INV-2479', 'سارة عادل', 1, 19, 33],
  ['تسوية جرد — لبن جهينة (−٣)', 'طارق حسن', 1, 21, 10],
  ['إيقاف صلاحيات المستخدم «يوسف كامل»', 'المدير', 2, 12, 2],
  ['نسخة احتياطية مشفّرة للقاعدة المحلية', 'النظام', 2, 3, 0],
];

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

export async function seed(db: HaseebDatabase): Promise<void> {
  await db.mutate(
    {
      entity: 'database',
      action: 'seed',
      actor: 'النظام',
      localOnly: true,
      description: 'تهيئة قاعدة البيانات المحلية ببيانات المنشأة الافتتاحية',
    },
    async (tx) => {
      await seedProfile(tx);
      await seedCatalogue(tx);
      await seedCustomers(tx);
      const extraIds = await seedExtraDebtors(tx);
      await seedInvoices(tx);
      await seedTodayTickets(tx);
      await seedDebtLedger(tx, extraIds);
      await seedMovements(tx);
      await seedOrders(tx);
      await seedExpensesStaff(tx);
      await tx.execute('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [
        'seeded_at',
        nowIso(),
      ]);
    },
  );

  await seedAuditHistory(db);
}

async function seedProfile(tx: SqlTx): Promise<void> {
  await tx.execute(
    `INSERT INTO business_profile (id, name, business_type, currency_code, currency_label,
       phone, commercial_reg, tax_number, vat_rate, onboarded_at, created_at)
     VALUES (1, 'مؤسسة النور التجارية', 'بقالة / سوبرماركت', 'EGP', 'ج.م',
             '01066554433', '448291', '302199487', 14, ?, ?)`,
    [at(90, 9), at(90, 9)],
  );
}

async function seedCatalogue(tx: SqlTx): Promise<void> {
  for (const c of CATEGORIES) {
    await tx.execute('INSERT INTO categories (id, name, position) VALUES (?, ?, ?)', [c.id, c.name, c.position]);
  }
  for (const p of PRODUCTS) {
    await tx.execute(
      `INSERT INTO products (id, sku, barcode, name, category_id, cost_piasters,
         price_piasters, qty_on_hand, low_threshold, crit_threshold, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 20, 10, ?)`,
      [p.id, p.sku, p.barcode, p.name, p.category, P(p.cost), P(p.price), p.qty, at(90, 9)],
    );
  }
}

async function seedCustomers(tx: SqlTx): Promise<void> {
  for (const c of CUSTOMERS) {
    await tx.execute(
      `INSERT INTO customers (id, name, kind, phone, city, tier, min_order_qty, since_year, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.id, c.name, c.kind, c.phone, c.city, c.tier, c.moq, c.since, at(90, 9)],
    );
  }
}

async function seedExtraDebtors(tx: SqlTx): Promise<string[]> {
  const ids: string[] = [];
  for (const [i, c] of EXTRA_DEBTORS.entries()) {
    const id = `cus-extra-${i + 1}`;
    ids.push(id);
    await tx.execute(
      `INSERT INTO customers (id, name, kind, phone, city, tier, min_order_qty, since_year, created_at)
       VALUES (?, ?, 'retail', ?, 'المنصورة', NULL, 0, 2024, ?)`,
      [id, c.name, c.phone, at(90, 9)],
    );
  }
  return ids;
}

/**
 * The month's invoices: the six the design names, plus enough earlier ones to
 * reach «٤٨ فاتورة» totalling «٦٢,٤٠٠ ج.م» exactly. The named six are the
 * most recent, so they head the invoice table.
 */
async function seedInvoices(tx: SqlTx): Promise<void> {
  for (const inv of NAMED_INVOICES) {
    await writeInvoice(tx, {
      no: inv.no,
      customer: inv.customer,
      occurredAt: at(inv.daysAgo, inv.hour, inv.minute),
      dueAt: inv.status === 'paid' ? null : at(inv.daysAgo - 30, 12),
      total: P(inv.total),
      profit: P(inv.profit),
      status: inv.status,
      kind: inv.kind,
      channel: inv.channel,
      method: inv.method,
      lines: inv.lines.map((l) => {
        const p = product(l.sku);
        return { productId: p.id, name: p.name, qty: l.qty, unit: P(p.price), cost: P(p.cost) };
      }),
    });
  }

  // Fill the rest of the month. Totals are distributed deterministically and
  // the last invoice absorbs the rounding, so the month's «مبلغ الفواتير»
  // lands on 62,400.00 to the piaster.
  const namedTotal = NAMED_INVOICES.reduce((t, i) => t + P(i.total), 0);
  const todayTotal = TODAY_TICKETS.reduce((t, ticket) => {
    const p = product(ticket.sku);
    const subtotal = P(p.price) * ticket.qty;
    return t + subtotal + Math.round((subtotal * 14) / 100);
  }, 0);

  const fillerCount = MONTH_INVOICE_COUNT - NAMED_INVOICES.length - TODAY_TICKETS.length;
  let remaining = P(MONTH_INVOICED_TOTAL) - namedTotal - todayTotal;

  const retailCustomers = CUSTOMERS.filter((c) => c.kind !== 'supplier');
  let seq = 2475 - fillerCount;

  for (let i = 0; i < fillerCount; i += 1) {
    const isLast = i === fillerCount - 1;
    // A gentle sawtooth so the older history does not look machine-flat.
    const share = 0.6 + ((i * 7) % 11) / 10;
    const nominal = Math.round((remaining / (fillerCount - i)) * share);
    const total = isLast ? remaining : Math.max(5000, Math.min(nominal, remaining - (fillerCount - i - 1) * 5000));
    remaining -= total;

    // Spread over days 1–29 so every day of the seven-day chart has trade on
    // it; a gap day in a shop's sales chart reads as a bug, not a holiday.
    const daysAgo = 1 + (i % 29);
    const customer = retailCustomers[i % retailCustomers.length];
    const p = PRODUCTS[i % PRODUCTS.length];
    const qty = Math.max(1, Math.round(splitVatInclusive(total).subtotal / P(p.price)));

    seq += 1;
    await writeInvoice(tx, {
      no: `INV-${seq}`,
      customer: customer.id,
      occurredAt: at(daysAgo, 10 + (i % 9), (i * 13) % 60),
      dueAt: null,
      total,
      profit: Math.round(total * 0.21),
      status: 'paid',
      kind: customer.kind === 'wholesale' ? 'wholesale' : 'retail',
      channel: customer.kind === 'wholesale' ? 'wholesale' : 'retail',
      method: i % 3 === 0 ? 'card' : i % 3 === 1 ? 'wallet' : 'cash',
      lines: [{ productId: p.id, name: p.name, qty, unit: P(p.price), cost: P(p.cost) }],
    });
  }
}

interface InvoiceSeed {
  no: string;
  customer: string | null;
  occurredAt: string;
  dueAt: string | null;
  total: number;
  profit: number;
  status: 'paid' | 'pending' | 'overdue';
  kind: 'retail' | 'wholesale';
  channel: 'retail' | 'wholesale' | 'preorder' | 'other';
  method: 'cash' | 'wallet' | 'card' | 'credit';
  lines: Array<{ productId: string; name: string; qty: number; unit: number; cost: number }>;
}

/**
 * Write one historical sale and its invoice.
 *
 * Header amounts are authoritative (this is an import, and the stated totals
 * are what the books say); the lines are the detail behind them. No stock
 * movement is written — the catalogue quantities are already closing figures.
 */
async function writeInvoice(tx: SqlTx, inv: InvoiceSeed): Promise<void> {
  const { subtotal, vat } = splitVatInclusive(inv.total);
  const saleId = newId();
  const invoiceId = newId();

  await tx.execute(
    `INSERT INTO sales (id, invoice_no, customer_id, channel, payment_method,
       subtotal_piasters, discount_piasters, vat_piasters, total_piasters,
       profit_piasters, vat_rate, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 14, ?)`,
    [saleId, inv.no, inv.customer, inv.channel, inv.method, subtotal, vat, inv.total, inv.profit, inv.occurredAt],
  );

  await tx.execute(
    `INSERT INTO invoices (id, invoice_no, sale_id, customer_id, kind, status,
       issued_at, due_at, subtotal_piasters, discount_piasters, vat_piasters,
       total_piasters, profit_piasters, qr_payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, '')`,
    [invoiceId, inv.no, saleId, inv.customer, inv.kind, inv.status, inv.occurredAt, inv.dueAt, subtotal, vat, inv.total, inv.profit],
  );

  for (const line of inv.lines) {
    const total = line.unit * line.qty;
    await tx.execute(
      `INSERT INTO sale_lines (id, sale_id, product_id, name_snapshot, qty,
         unit_piasters, cost_piasters, discount_percent, discount_piasters, total_piasters)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
      [newId(), saleId, line.productId, line.name, line.qty, line.unit, line.cost, total],
    );
    await tx.execute(
      `INSERT INTO invoice_lines (id, invoice_id, product_id, name_snapshot, qty,
         unit_piasters, total_piasters)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId(), invoiceId, line.productId, line.name, line.qty, line.unit, total],
    );
  }
}

/**
 * Today's five tickets. Unlike the imported history these behave like real
 * sales: they carry stock movements, because they happened after the closing
 * quantities were taken.
 */
async function seedTodayTickets(tx: SqlTx): Promise<void> {
  let seq = 2481;
  for (const ticket of TODAY_TICKETS) {
    const p = product(ticket.sku);
    const occurredAt = at(0, ticket.hour, ticket.minute);
    const subtotal = P(p.price) * ticket.qty;
    const vat = Math.round((subtotal * 14) / 100);
    const total = subtotal + vat;
    const profit = (P(p.price) - P(p.cost)) * ticket.qty;
    seq += 1;
    const no = `INV-${seq}`;
    const saleId = newId();
    const invoiceId = newId();

    await tx.execute(
      `INSERT INTO sales (id, invoice_no, customer_id, channel, payment_method,
         subtotal_piasters, discount_piasters, vat_piasters, total_piasters,
         profit_piasters, vat_rate, occurred_at)
       VALUES (?, ?, ?, 'retail', ?, ?, 0, ?, ?, ?, 14, ?)`,
      [saleId, no, ticket.customer, ticket.method, subtotal, vat, total, profit, occurredAt],
    );
    await tx.execute(
      `INSERT INTO sale_lines (id, sale_id, product_id, name_snapshot, qty,
         unit_piasters, cost_piasters, discount_percent, discount_piasters, total_piasters)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
      [newId(), saleId, p.id, p.name, ticket.qty, P(p.price), P(p.cost), subtotal],
    );
    await tx.execute(
      `INSERT INTO invoices (id, invoice_no, sale_id, customer_id, kind, status,
         issued_at, due_at, subtotal_piasters, discount_piasters, vat_piasters,
         total_piasters, profit_piasters, qr_payload)
       VALUES (?, ?, ?, ?, 'retail', ?, ?, ?, ?, 0, ?, ?, ?, '')`,
      [
        invoiceId, no, saleId, ticket.customer,
        ticket.method === 'credit' ? 'pending' : 'paid',
        occurredAt, ticket.method === 'credit' ? at(-30, 12) : null,
        subtotal, vat, total, profit,
      ],
    );
    await tx.execute(
      `INSERT INTO invoice_lines (id, invoice_id, product_id, name_snapshot, qty,
         unit_piasters, total_piasters)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId(), invoiceId, p.id, p.name, ticket.qty, P(p.price), subtotal],
    );
  }
}

/**
 * The debt ledger.
 *
 * محمود عبد الله's history is the one the design draws in full — two debts
 * (١,٤٥٠ and ٨٠٠) against two payments (٥٠٠ and ٣٠٠), leaving the ١,٤٥٠
 * outstanding the profile panel shows, twelve days past due. The remaining
 * balances are seeded to the design's figures, and the extra thirteen
 * customers bring the ledger to «١٢,٤٠٠ · ١٨ عميلاً».
 */
async function seedDebtLedger(tx: SqlTx, extraIds: string[]): Promise<void> {
  const debt = async (
    customer: string, pounds: number, openedDaysAgo: number, dueDaysAgo: number,
    note: string, direction: 'receivable' | 'payable' = 'receivable',
  ): Promise<void> => {
    await tx.execute(
      `INSERT INTO debts (id, customer_id, invoice_id, direction, principal_piasters,
         opened_at, due_at, note)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`,
      [newId(), customer, direction, P(pounds), at(openedDaysAgo, 12), at(dueDaysAgo, 12), note],
    );
  };
  const payment = async (
    customer: string, pounds: number, method: string, daysAgo: number,
  ): Promise<void> => {
    await tx.execute(
      `INSERT INTO payments (id, debt_id, customer_id, amount_piasters, method, paid_at, note)
       VALUES (?, NULL, ?, ?, ?, ?, '')`,
      [newId(), customer, P(pounds), method, at(daysAgo, 13)],
    );
  };

  // محمود عبد الله — the fully specified ledger, outstanding ١,٤٥٠, due 12 days ago.
  await debt('cus-mahmoud', 1450, 19, 12, 'فاتورة INV-2479');
  await debt('cus-mahmoud', 800, 35, 28, 'فاتورة INV-2465');
  await payment('cus-mahmoud', 500, 'cash', 12);
  await payment('cus-mahmoud', 300, 'wallet', 27);

  // The other named debtors, at the balances and aging the design states.
  await debt('cus-sayed', 1320, 22, -4, 'رصيد مفتوح');
  await payment('cus-sayed', 400, 'transfer', 4);

  await debt('cus-hoda', 3500, 14, -3, 'فاتورة INV-2480');
  await payment('cus-hoda', 900, 'transfer', 2);

  await debt('cus-fatma', 800, 40, 20, 'فاتورة INV-2465');
  await payment('cus-fatma', 800, 'cash', 1);

  await debt('cus-safa', 5300, 26, 9, 'رصيد مفتوح');
  await payment('cus-safa', 1200, 'card', 0);

  await debt('cus-rokn', 930, 18, -6, 'فاتورة INV-2477');
  await payment('cus-rokn', 250, 'cash', 6);

  // The remaining thirteen, each with one payment already made.
  for (const [i, c] of EXTRA_DEBTORS.entries()) {
    const id = extraIds[i];
    const paid = 120 + i * 10;
    await debt(id, c.owed + paid, 30 + i, c.dueDaysAgo, 'رصيد مفتوح');
    await payment(id, paid, i % 2 === 0 ? 'cash' : 'wallet', c.lastPaidDaysAgo);
  }

  // «محصّل هذا الشهر ٩,٦٤٠ · ٢٣ سداداً» — this month's collections against
  // older invoices. Each is paired with an equal, fully-settled debt raised
  // before the customer's open balance, so FIFO allocation clears the old
  // debt first and the outstanding figures above are untouched.
  for (const [i, [customer, pounds, method, daysAgo]] of COLLECTIONS.entries()) {
    await debt(customer, pounds, 60 + i, 45 + i, 'فاتورة سابقة');
    await payment(customer, pounds, method, daysAgo);
  }

  // «مستحق عليك (دائنون) ٣,٨٥٠ · ٤ موردين»
  await debt('sup-sharq', 1600, 2, -12, 'أمر توريد PO-311', 'payable');
  await debt('sup-delta', 1150, 3, -9, 'أمر توريد PO-310', 'payable');
  await debt('sup-ahram', 700, 6, -15, 'رصيد مورد', 'payable');
  await debt('sup-nour', 400, 8, -20, 'رصيد مورد', 'payable');
}

async function seedMovements(tx: SqlTx): Promise<void> {
  for (const m of MOVEMENTS) {
    const p = product(m.sku);
    await tx.execute(
      `INSERT INTO stock_movements
         (id, product_id, kind, qty_delta, qty_after, actor, counterparty, note, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '', ?)`,
      [newId(), p.id, m.kind, m.delta, p.qty, m.actor, m.counterparty, at(m.daysAgo, m.hour, m.minute)],
    );
  }
}

async function seedOrders(tx: SqlTx): Promise<void> {
  for (const [no, direction, cid, name, status, fulfilment, items, total, daysAgo, hour] of ORDERS) {
    await tx.execute(
      `INSERT INTO orders (id, order_no, direction, counterparty_id, counterparty_name,
         status, fulfilment, item_count, summary, total_piasters, placed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`,
      [newId(), no, direction, cid, name, status, fulfilment, items, P(total), at(daysAgo, hour, 41)],
    );
  }
}

async function seedExpensesStaff(tx: SqlTx): Promise<void> {
  const period = new Date().toISOString().slice(0, 7);
  for (const e of EXPENSES) {
    await tx.execute(
      `INSERT INTO expenses (id, label, amount_piasters, color, period, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newId(), e.label, P(e.amount), e.color, period, at(5, 9)],
    );
  }
  for (const s of STAFF) {
    await tx.execute(
      'INSERT INTO staff (id, name, role, scope, active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [s.id, s.name, s.role, s.scope, s.active ? 1 : 0, at(120, 9)],
    );
    for (const ability of s.abilities) {
      await tx.execute('INSERT INTO permissions (staff_id, ability, granted) VALUES (?, ?, 1)', [s.id, ability]);
    }
  }
}

/** The five audit lines the design shows, written as history after the seed. */
async function seedAuditHistory(db: HaseebDatabase): Promise<void> {
  await db.mutate(
    {
      entity: 'audit_log',
      action: 'seed_history',
      actor: 'النظام',
      localOnly: true,
      description: 'استيراد سجل التدقيق الافتتاحي',
    },
    async (tx) => {
      for (const [description, actor, daysAgo, hour, minute] of AUDIT_HISTORY) {
        await tx.execute(
          `INSERT INTO audit_log (id, entity, entity_id, action, description, actor, payload, occurred_at)
           VALUES (?, 'history', '', 'record', ?, ?, '', ?)`,
          [newId(), description, actor, at(daysAgo, hour, minute)],
        );
      }
    },
  );
}

/** Wipe every table and re-seed. Reachable from الإعدادات. */
export async function resetToSeed(db: HaseebDatabase): Promise<void> {
  await db.mutate(
    {
      entity: 'database',
      action: 'reset',
      actor: 'المدير',
      localOnly: true,
      description: 'إعادة ضبط قاعدة البيانات المحلية إلى البيانات الافتتاحية',
    },
    async (tx) => {
      for (const table of [
        'sale_lines', 'invoice_lines', 'payments', 'debts', 'stock_movements',
        'sales', 'invoices', 'orders', 'permissions', 'staff', 'expenses',
        'products', 'categories', 'customers', 'business_profile',
        'audit_log', 'sync_queue', 'meta',
      ]) {
        await tx.execute(`DELETE FROM ${table}`);
      }
    },
  );
  await seed(db);
  db.touch();
}
