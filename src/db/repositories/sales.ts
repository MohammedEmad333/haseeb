import { HaseebDatabase, newId, nowIso, type Row } from '../database';
import type {
  Invoice,
  InvoiceLine,
  InvoiceStatus,
  InvoiceWithLines,
  PaymentMethod,
  Sale,
  SaleLine,
  SalesChannel,
} from '../types';
import { computeTotals } from '@/domain/tax';
import { lineProfit } from '@/domain/inventory';
import { ProductRepository } from './products';
import { money } from '@/lib/format';

export interface CartLine {
  productId: string;
  name: string;
  qty: number;
  unit: number;
  cost: number;
  discountPercent?: number;
  discount?: number;
}

export interface CheckoutInput {
  lines: CartLine[];
  paymentMethod: PaymentMethod;
  channel?: SalesChannel;
  customerId?: string | null;
  customerName?: string;
  discount?: number;
  vatRate?: number;
  actor?: string;
  /** Credit sales post a debt instead of taking payment. */
  dueAt?: string;
}

export interface CheckoutResult {
  sale: Sale;
  /** The invoice with its lines, ready to print without a second read. */
  invoice: InvoiceWithLines;
  debtId: string | null;
}

function toSale(row: Row): Sale {
  return {
    id: String(row.id),
    invoiceNo: String(row.invoice_no),
    customerId: row.customer_id === null ? null : String(row.customer_id),
    customerName: row.customer_name == null ? null : String(row.customer_name),
    channel: String(row.channel) as SalesChannel,
    paymentMethod: String(row.payment_method) as PaymentMethod,
    subtotal: Number(row.subtotal_piasters),
    discount: Number(row.discount_piasters),
    vat: Number(row.vat_piasters),
    total: Number(row.total_piasters),
    profit: Number(row.profit_piasters),
    vatRate: Number(row.vat_rate),
    occurredAt: String(row.occurred_at),
  };
}

function toInvoice(row: Row): Invoice {
  return {
    id: String(row.id),
    invoiceNo: String(row.invoice_no),
    saleId: row.sale_id === null ? null : String(row.sale_id),
    customerId: row.customer_id === null ? null : String(row.customer_id),
    customerName: row.customer_name == null ? 'عميل نقدي' : String(row.customer_name),
    kind: String(row.kind) as 'retail' | 'wholesale',
    status: String(row.status) as InvoiceStatus,
    issuedAt: String(row.issued_at),
    dueAt: row.due_at === null ? null : String(row.due_at),
    subtotal: Number(row.subtotal_piasters),
    discount: Number(row.discount_piasters),
    vat: Number(row.vat_piasters),
    total: Number(row.total_piasters),
    profit: Number(row.profit_piasters),
    qrPayload: String(row.qr_payload ?? ''),
  };
}

const INVOICE_SELECT = `
  SELECT i.*, c.name AS customer_name
  FROM invoices i
  LEFT JOIN customers c ON c.id = i.customer_id`;

export class SalesRepository {
  #products: ProductRepository;

  constructor(private readonly db: HaseebDatabase) {
    this.#products = new ProductRepository(db);
  }

  /** Next invoice number in the INV-#### series. */
  async nextInvoiceNo(): Promise<string> {
    const last = await this.db.value<string>(
      `SELECT invoice_no FROM invoices WHERE invoice_no LIKE 'INV-%' ORDER BY invoice_no DESC LIMIT 1`,
    );
    const n = last ? Number(last.slice(4)) + 1 : 2482;
    return `INV-${n}`;
  }

  /**
   * Close a sale.
   *
   * One transaction covers: the sale and its lines, the stock decrement and
   * its movement rows, the invoice and its lines, and — for a credit sale —
   * the debt. Either the whole sale happened or none of it did; a POS that
   * can leave stock decremented without an invoice is worse than one that
   * fails loudly.
   */
  async checkout(input: CheckoutInput): Promise<CheckoutResult> {
    if (input.lines.length === 0) throw new Error('cannot close an empty sale');

    const vatRate = input.vatRate ?? (await this.#vatRate());
    const subtotal = input.lines.reduce(
      (total, l) => total + (l.qty * l.unit - (l.discount ?? 0)),
      0,
    );
    const totals = computeTotals({ subtotal, discount: input.discount ?? 0, vatRate });
    const profit = input.lines.reduce(
      (total, l) => total + lineProfit(l.unit, l.cost, l.qty) - (l.discount ?? 0),
      0,
    );

    const saleId = newId();
    const invoiceId = newId();
    const invoiceNo = await this.nextInvoiceNo();
    const at = nowIso();
    const onCredit = input.paymentMethod === 'credit';
    const debtId = onCredit ? newId() : null;
    const dueAt = input.dueAt ?? defaultDueDate(at);

    // Validate stock before opening the transaction so the error message
    // names the product rather than surfacing as a rollback.
    // Snapshot the stock once, before the transaction, so the error message
    // can name the product rather than surfacing as a bare rollback — and so
    // the decrement below does not re-read a row it is about to change.
    const onHand = new Map<string, number>();
    const names = new Map<string, string>();
    for (const line of input.lines) {
      if (!onHand.has(line.productId)) {
        const product = await this.#products.byId(line.productId);
        if (!product) throw new Error(`unknown product ${line.productId}`);
        onHand.set(line.productId, product.qtyOnHand);
        names.set(line.productId, product.name);
      }
      // Draw the running balance down as we go, so two lines of the same
      // product are checked against what is left after the first, not against
      // the opening quantity twice over.
      const remaining = onHand.get(line.productId)! - line.qty;
      if (remaining < 0) {
        throw new Error(
          `الكمية المتاحة من «${names.get(line.productId)}» ${onHand.get(line.productId)} فقط`,
        );
      }
      onHand.set(line.productId, remaining);
    }

    await this.db.mutate(
      {
        entity: 'sale',
        entityId: saleId,
        action: 'checkout',
        ...(input.actor ? { actor: input.actor } : {}),
        description: `بيع ${input.lines.length} أصناف — فاتورة ${invoiceNo} بمبلغ ${money(totals.total)}`,
        payload: { invoiceNo, total: totals.total, paymentMethod: input.paymentMethod },
      },
      async (tx) => {
        await tx.execute(
          `INSERT INTO sales (id, invoice_no, customer_id, channel, payment_method,
             subtotal_piasters, discount_piasters, vat_piasters, total_piasters,
             profit_piasters, vat_rate, occurred_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            saleId,
            invoiceNo,
            input.customerId ?? null,
            input.channel ?? 'retail',
            input.paymentMethod,
            totals.subtotal,
            totals.discount,
            totals.vat,
            totals.total,
            profit,
            vatRate,
            at,
          ],
        );

        for (const line of input.lines) {
          await tx.execute(
            `INSERT INTO sale_lines (id, sale_id, product_id, name_snapshot, qty,
               unit_piasters, cost_piasters, discount_percent, discount_piasters, total_piasters)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              newId(),
              saleId,
              line.productId,
              line.name,
              line.qty,
              line.unit,
              line.cost,
              line.discountPercent ?? 0,
              line.discount ?? 0,
              line.qty * line.unit - (line.discount ?? 0),
            ],
          );

          // Stock decrement lives in the same transaction as the sale. The
          // map already holds the post-sale balance from the check above.
          const qtyAfter = onHand.get(line.productId)!;
          await tx.execute('UPDATE products SET qty_on_hand = ? WHERE id = ?', [
            qtyAfter,
            line.productId,
          ]);
          await tx.execute(
            `INSERT INTO stock_movements
               (id, product_id, kind, qty_delta, qty_after, actor, counterparty, note, occurred_at)
             VALUES (?, ?, 'sale', ?, ?, ?, ?, ?, ?)`,
            [
              newId(),
              line.productId,
              -line.qty,
              qtyAfter,
              input.actor ?? this.db.actor,
              input.customerName ?? '',
              invoiceNo,
              at,
            ],
          );
        }

        await tx.execute(
          `INSERT INTO invoices (id, invoice_no, sale_id, customer_id, kind, status,
             issued_at, due_at, subtotal_piasters, discount_piasters, vat_piasters,
             total_piasters, profit_piasters, qr_payload)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            invoiceId,
            invoiceNo,
            saleId,
            input.customerId ?? null,
            input.channel === 'wholesale' ? 'wholesale' : 'retail',
            onCredit ? 'pending' : 'paid',
            at,
            onCredit ? dueAt : null,
            totals.subtotal,
            totals.discount,
            totals.vat,
            totals.total,
            profit,
            '',
          ],
        );

        for (const line of input.lines) {
          await tx.execute(
            `INSERT INTO invoice_lines (id, invoice_id, product_id, name_snapshot, qty,
               unit_piasters, total_piasters)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              newId(),
              invoiceId,
              line.productId,
              line.name,
              line.qty,
              line.unit,
              line.qty * line.unit - (line.discount ?? 0),
            ],
          );
        }

        if (onCredit && debtId) {
          if (!input.customerId) {
            throw new Error('تسجيل الدين يحتاج إلى اختيار عميل');
          }
          await tx.execute(
            `INSERT INTO debts (id, customer_id, invoice_id, direction, principal_piasters,
               opened_at, due_at, note)
             VALUES (?, ?, ?, 'receivable', ?, ?, ?, ?)`,
            [debtId, input.customerId, invoiceId, totals.total, at, dueAt, `فاتورة ${invoiceNo}`],
          );
        }
      },
    );

    return {
      sale: (await this.saleById(saleId))!,
      invoice: (await this.invoiceById(invoiceId))!,
      debtId,
    };
  }

  async #vatRate(): Promise<number> {
    return Number((await this.db.value('SELECT vat_rate FROM business_profile WHERE id = 1')) ?? 14);
  }

  async saleById(id: string): Promise<Sale | null> {
    const row = await this.db.get(
      `SELECT s.*, c.name AS customer_name FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?`,
      [id],
    );
    return row ? toSale(row) : null;
  }

  async recentSales(limit = 20): Promise<Sale[]> {
    const rows = await this.db.all(
        `SELECT s.*, c.name AS customer_name FROM sales s
         LEFT JOIN customers c ON c.id = s.customer_id
         ORDER BY s.occurred_at DESC LIMIT ?`,
      [limit],
    );
    return rows.map(toSale);
  }

  /** The POS «سجل البيع المباشر» — one row per sold line, newest first. */
  async recentSaleLines(
    limit = 12,
  ): Promise<Array<SaleLine & { occurredAt: string; paymentMethod: PaymentMethod }>> {
    const rows = await this.db.all(
        `SELECT l.*, s.occurred_at, s.payment_method FROM sale_lines l
         JOIN sales s ON s.id = l.sale_id
         ORDER BY s.occurred_at DESC, l.rowid DESC LIMIT ?`,
      [limit],
    );
    return rows.map((r) => ({
        id: String(r.id),
        productId: String(r.product_id),
        name: String(r.name_snapshot),
        qty: Number(r.qty),
        unit: Number(r.unit_piasters),
        cost: Number(r.cost_piasters),
        discountPercent: Number(r.discount_percent),
        discount: Number(r.discount_piasters),
        total: Number(r.total_piasters),
        occurredAt: String(r.occurred_at),
        paymentMethod: String(r.payment_method) as PaymentMethod,
      }));
  }

  // ---- invoices ------------------------------------------------------

  async invoiceById(id: string): Promise<InvoiceWithLines | null> {
    const row = await this.db.get(`${INVOICE_SELECT} WHERE i.id = ?`, [id]);
    if (!row) return null;
    return { ...toInvoice(row), lines: await this.invoiceLines(id) };
  }

  async invoiceByNo(invoiceNo: string): Promise<InvoiceWithLines | null> {
    const row = await this.db.get(`${INVOICE_SELECT} WHERE i.invoice_no = ?`, [invoiceNo]);
    if (!row) return null;
    return { ...toInvoice(row), lines: await this.invoiceLines(String(row.id)) };
  }

  async invoiceLines(invoiceId: string): Promise<InvoiceLine[]> {
    const rows = await this.db.all(
      'SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY rowid',
      [invoiceId],
    );
    return rows.map((r) => ({
        id: String(r.id),
        productId: r.product_id === null ? null : String(r.product_id),
        name: String(r.name_snapshot),
        qty: Number(r.qty),
      unit: Number(r.unit_piasters),
      total: Number(r.total_piasters),
    }));
  }

  async invoices(
    filter: { from?: string; to?: string; kind?: 'retail' | 'wholesale' } = {},
  ): Promise<Invoice[]> {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.from) {
      where.push('i.issued_at >= ?');
      params.push(filter.from);
    }
    if (filter.to) {
      where.push('i.issued_at <= ?');
      params.push(filter.to);
    }
    if (filter.kind) {
      where.push('i.kind = ?');
      params.push(filter.kind);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await this.db.all(
      `${INVOICE_SELECT} ${clause} ORDER BY i.issued_at DESC`,
      params,
    );
    return rows.map(toInvoice);
  }

  async latestInvoice(): Promise<InvoiceWithLines | null> {
    const row = await this.db.get(`${INVOICE_SELECT} ORDER BY i.issued_at DESC LIMIT 1`);
    if (!row) return null;
    return { ...toInvoice(row), lines: await this.invoiceLines(String(row.id)) };
  }

  async setInvoiceQr(invoiceId: string, payload: string): Promise<void> {
    await this.db.mutate(
      {
        entity: 'invoice',
        entityId: invoiceId,
        action: 'set_qr',
        description: 'توليد رمز QR للفاتورة الضريبية',
      },
      (tx) => tx.execute('UPDATE invoices SET qr_payload = ? WHERE id = ?', [payload, invoiceId]),
    );
  }
}

/** Credit sales fall due 30 days out unless the cashier says otherwise. */
function defaultDueDate(fromIso: string): string {
  const d = new Date(fromIso);
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}
