import { HaseebDatabase, newId, nowIso, type Row } from '../database';
import type { Category, Product, StockMovement } from '../types';
import {
  applyMovement,
  movementDelta,
  stockStatus,
  MOVEMENT_LABEL,
  type MovementKind,
} from '@/domain/inventory';
import { money } from '@/lib/format';

const PRODUCT_SELECT = `
  SELECT p.id, p.sku, p.barcode, p.name, p.category_id, c.name AS category_name,
         p.cost_piasters, p.price_piasters, p.qty_on_hand, p.low_threshold, p.crit_threshold
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id`;

function toProduct(row: Row): Product {
  const qty = Number(row.qty_on_hand);
  const low = Number(row.low_threshold);
  const crit = Number(row.crit_threshold);
  return {
    id: String(row.id),
    sku: String(row.sku),
    barcode: row.barcode === null ? null : String(row.barcode),
    name: String(row.name),
    categoryId: row.category_id === null ? null : String(row.category_id),
    categoryName: row.category_name === null ? null : String(row.category_name),
    cost: Number(row.cost_piasters),
    price: Number(row.price_piasters),
    qtyOnHand: qty,
    lowThreshold: low,
    critThreshold: crit,
    status: stockStatus(qty, { low, critical: crit }),
  };
}

export class ProductRepository {
  constructor(private readonly db: HaseebDatabase) {}

  async categories(): Promise<Category[]> {
    const rows = await this.db.all('SELECT id, name, position FROM categories ORDER BY position, name');
    return rows.map((r) => ({ id: String(r.id), name: String(r.name), position: Number(r.position) }));
  }

  async list(categoryId?: string | null): Promise<Product[]> {
    const rows = categoryId
      ? await this.db.all(`${PRODUCT_SELECT} WHERE p.category_id = ? ORDER BY p.name`, [categoryId])
      : await this.db.all(`${PRODUCT_SELECT} ORDER BY p.name`);
    return rows.map(toProduct);
  }

  async byId(id: string): Promise<Product | null> {
    const row = await this.db.get(`${PRODUCT_SELECT} WHERE p.id = ?`, [id]);
    return row ? toProduct(row) : null;
  }

  /** Barcode scan, then a name/SKU contains-match — what the POS search does. */
  async search(term: string): Promise<Product[]> {
    const trimmed = term.trim();
    if (!trimmed) return this.list();
    const exact = await this.db.get(`${PRODUCT_SELECT} WHERE p.barcode = ? OR p.sku = ?`, [
      trimmed,
      trimmed,
    ]);
    if (exact) return [toProduct(exact)];
    const like = `%${trimmed}%`;
    const rows = await this.db.all(
      `${PRODUCT_SELECT} WHERE p.name LIKE ? OR p.sku LIKE ? ORDER BY p.name`,
      [like, like],
    );
    return rows.map(toProduct);
  }

  async lowStock(): Promise<Product[]> {
    return (await this.list()).filter((p) => p.status !== 'inStock');
  }

  async criticalCount(): Promise<number> {
    return (await this.list()).filter((p) => p.status === 'critical').length;
  }

  async updatePrice(id: string, price: number, actor?: string): Promise<void> {
    const before = await this.byId(id);
    if (!before) throw new Error(`unknown product ${id}`);
    await this.db.mutate(
      {
        entity: 'product',
        entityId: id,
        action: 'update_price',
        actor,
        description: `تعديل سعر بيع «${before.name}» من ${money(before.price)} إلى ${money(price)}`,
        payload: { from: before.price, to: price },
      },
      (tx) => tx.execute('UPDATE products SET price_piasters = ? WHERE id = ?', [price, id]),
    );
  }

  /**
   * Move stock and record the movement. Returns the new on-hand quantity.
   * `applyMovement` refuses to drive a product negative, and because that
   * check runs inside the transaction, the movement row is rolled back with it.
   */
  async move(input: {
    productId: string;
    kind: MovementKind;
    qty: number;
    actor?: string;
    counterparty?: string;
    note?: string;
    occurredAt?: string;
  }): Promise<number> {
    const product = await this.byId(input.productId);
    if (!product) throw new Error(`unknown product ${input.productId}`);
    const qtyAfter = applyMovement(product.qtyOnHand, input.kind, input.qty);
    const delta = movementDelta(input.kind, input.qty);
    const at = input.occurredAt ?? nowIso();

    await this.db.mutate(
      {
        entity: 'stock_movement',
        entityId: input.productId,
        action: input.kind,
        ...(input.actor ? { actor: input.actor } : {}),
        description: `${MOVEMENT_LABEL[input.kind]} — ${product.name} (${delta > 0 ? '+' : '−'}${Math.abs(delta)})`,
        payload: { productId: input.productId, delta, qtyAfter },
      },
      async (tx) => {
        await tx.execute('UPDATE products SET qty_on_hand = ? WHERE id = ?', [qtyAfter, input.productId]);
        await tx.execute(
          `INSERT INTO stock_movements
             (id, product_id, kind, qty_delta, qty_after, actor, counterparty, note, occurred_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newId(),
            input.productId,
            input.kind,
            delta,
            qtyAfter,
            input.actor ?? this.db.actor,
            input.counterparty ?? '',
            input.note ?? '',
            at,
          ],
        );
      },
    );
    return qtyAfter;
  }

  async movements(limit = 20): Promise<StockMovement[]> {
    const rows = await this.db.all(
      `SELECT m.*, p.name AS product_name
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       ORDER BY m.occurred_at DESC
       LIMIT ?`,
      [limit],
    );
    return rows.map((r) => ({
      id: String(r.id),
      productId: String(r.product_id),
      productName: String(r.product_name),
      kind: String(r.kind) as MovementKind,
      qtyDelta: Number(r.qty_delta),
      qtyAfter: Number(r.qty_after),
      actor: String(r.actor),
      counterparty: String(r.counterparty),
      note: String(r.note),
      occurredAt: String(r.occurred_at),
    }));
  }
}
