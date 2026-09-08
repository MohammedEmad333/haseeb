/**
 * I. المخزن — inventory and warehouse.
 *
 * The stock table and the movement timeline read from the same rows, so a
 * receipt booked here is visible on the next line of the ledger rather than
 * in a separate report that has to be reconciled.
 */

import { useMemo, useState } from 'react';
import { useHaseeb } from '@/state/HaseebProvider';
import { Badge, Button, Card, CardBody, CardHead, EmptyState, Input } from '@/ui/primitives';
import { AutoGrid, DataTable, PageHeader, Timeline, type Column } from '@/ui/composites';
import type { Product, StockMovement } from '@/db/types';
import { MOVEMENT_LABEL, STOCK_STATUS_LABEL, type StockStatus } from '@/domain/inventory';
import { NOUNS, counted, dateAndTime, money, num, signedNum } from '@/lib/format';

const STATUS_TINT: Record<StockStatus, { bg: string; fg: string; qty: string }> = {
  inStock: { bg: 'var(--hs-mint-bg)', fg: 'var(--hs-mint-text)', qty: 'var(--hs-ink)' },
  low: { bg: 'var(--hs-warn-bg)', fg: 'var(--hs-warn-text)', qty: 'var(--hs-warn-strong)' },
  critical: { bg: 'var(--hs-danger-bg)', fg: 'var(--hs-danger-text)', qty: 'var(--hs-danger-text)' },
};

const MOVEMENT_TINT: Record<string, { dot: string; fg: string }> = {
  purchase: { dot: 'var(--hs-emerald)', fg: 'var(--hs-mint-text)' },
  return: { dot: 'var(--hs-emerald)', fg: 'var(--hs-mint-text)' },
  sale: { dot: 'var(--hs-ink)', fg: 'var(--hs-ink)' },
  adjustment: { dot: 'var(--hs-warn-solid)', fg: 'var(--hs-warn-strong)' },
};

export function Inventory() {
  const { products, profile, revision, db } = useHaseeb();
  const [category, setCategory] = useState<string>('all');
  const [receiving, setReceiving] = useState<Product | null>(null);

  const view = useMemo(() => {
    if (!products) return null;
    return {
      categories: products.categories(),
      rows: products.list(category === 'all' ? null : category),
      movements: products.movements(8),
      alerts: products.list().filter((p) => p.status === 'critical').length,
    };
     
  }, [products, category, revision]);

  if (!view) return null;
  const unit = profile?.currencyLabel ?? 'ج.م';

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: 'الصنف',
      width: '1.6fr',
      render: (p) => (
        <>
          <div style={{ fontWeight: 500 }}>{p.name}</div>
          <div className="hs-num" style={{ fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-text-subtle)', marginBlockStart: 2 }}>
            {p.sku}
          </div>
        </>
      ),
    },
    {
      key: 'qty',
      header: 'الكمية',
      width: '0.8fr',
      render: (p) => (
        <span className="hs-num" style={{ fontWeight: 600, color: STATUS_TINT[p.status].qty }}>
          {num(p.qtyOnHand)}
        </span>
      ),
    },
    {
      key: 'cost',
      header: 'التكلفة',
      width: '0.9fr',
      render: (p) => <span className="hs-num">{money(p.cost)}</span>,
    },
    {
      key: 'price',
      header: 'سعر البيع',
      width: '0.9fr',
      render: (p) => <span className="hs-num">{money(p.price)}</span>,
    },
    {
      key: 'status',
      header: 'الحالة',
      width: '1fr',
      render: (p) => (
        <div className="hs-row" style={{ gap: 'var(--hs-sp-4)', justifyContent: 'space-between' }}>
          <Badge bg={STATUS_TINT[p.status].bg} fg={STATUS_TINT[p.status].fg}>
            {STOCK_STATUS_LABEL[p.status]}
          </Badge>
          <Button size="sm" onClick={() => setReceiving(p)}>
            توريد
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="المخزن"
        sub="الأرصدة الحالية · حركة الوارد والمنصرف"
        actions={
          view.alerts > 0 ? (
            <span
              className="hs-row"
              style={{
                gap: 'var(--hs-sp-4)',
                background: 'var(--hs-warn-bg)',
                border: '1px solid var(--hs-warn-border)',
                borderRadius: 'var(--hs-r-pill)',
                padding: 'var(--hs-sp-3) var(--hs-sp-7)',
                fontSize: 'var(--hs-fs-cell)',
                fontWeight: 600,
                color: 'var(--hs-warn-text)',
              }}
              role="status"
            >
              <span aria-hidden style={{ width: 9, height: 9, background: 'var(--hs-warn-solid)', transform: 'rotate(45deg)' }} />
              إنذار نفاد الكمية — {counted(view.alerts, NOUNS.item)}
            </span>
          ) : null
        }
      />

      <div className="hs-row" style={{ gap: 'var(--hs-sp-3)', flexWrap: 'wrap', marginBlockEnd: 'var(--hs-sp-7)' }}>
        <CategoryChip label="الكل" selected={category === 'all'} onClick={() => setCategory('all')} />
        {view.categories.map((c) => (
          <CategoryChip
            key={c.id}
            label={c.name}
            selected={category === c.id}
            onClick={() => setCategory(c.id)}
          />
        ))}
      </div>

      <AutoGrid min={340} style={{ alignItems: 'start' }}>
        <Card panel style={{ minWidth: 0 }}>
          <CardHead title="أرصدة الأصناف" sub={`${counted(view.rows.length, NOUNS.item)} · بالـ${unit}`} />
          <DataTable
            caption="جدول أرصدة المخزن"
            columns={columns}
            rows={view.rows}
            rowKey={(p) => p.id}
            empty={
              <EmptyState
                title="لا توجد أصناف في هذه الفئة"
                body="اختر فئة أخرى، أو أضف صنفاً جديداً ليظهر هنا مع رصيده وتكلفته."
              />
            }
          />
        </Card>

        <Card panel style={{ minWidth: 0 }}>
          <CardHead title="حركة المخزون" sub="الوارد والمنصرف والتسويات" />
          <CardBody>
            {view.movements.length === 0 ? (
              <EmptyState
                title="لا توجد حركة بعد"
                body="كل عملية توريد أو بيع أو تسوية جرد ستُسجَّل هنا بختم زمني."
              />
            ) : (
              <Timeline
                label="سجل حركة المخزون"
                items={view.movements.map((m: StockMovement) => {
                  const tint = MOVEMENT_TINT[m.kind] ?? MOVEMENT_TINT.sale;
                  const who = m.actor || m.counterparty;
                  return {
                    id: m.id,
                    dot: tint.dot,
                    title: `${MOVEMENT_LABEL[m.kind]} — ${m.productName}`,
                    meta: `${who ? `${who} · ` : ''}${dateAndTime(m.occurredAt)}`,
                    trailing: (
                      <span className="hs-num" style={{ fontWeight: 600, color: tint.fg }}>
                        {signedNum(m.qtyDelta)}
                      </span>
                    ),
                  };
                })}
              />
            )}
          </CardBody>
        </Card>
      </AutoGrid>

      {receiving ? (
        <ReceiveDialog
          product={receiving}
          onClose={() => setReceiving(null)}
          onSubmit={(qty, supplier) => {
            products!.move({
              productId: receiving.id,
              kind: 'purchase',
              qty,
              actor: 'أمين المخزن',
              counterparty: supplier,
            });
            void db?.flush();
            setReceiving(null);
          }}
        />
      ) : null}
    </>
  );
}

function CategoryChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="hs-chip" aria-pressed={selected} onClick={onClick}>
      {label}
    </button>
  );
}

/** Receiving stock — the one write this screen makes. */
function ReceiveDialog({
  product,
  onClose,
  onSubmit,
}: {
  product: Product;
  onClose: () => void;
  onSubmit: (qty: number, supplier: string) => void;
}) {
  const [qty, setQty] = useState('10');
  const [supplier, setSupplier] = useState('');
  const parsed = Number(qty);
  const invalid = !Number.isInteger(parsed) || parsed <= 0;

  return (
    <>
      <div className="hs-drawer__scrim" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`توريد ${product.name}`}
        style={{
          position: 'fixed',
          insetBlockStart: '50%',
          insetInlineStart: '50%',
          transform: 'translate(50%, -50%)',
          zIndex: 62,
          width: 'min(420px, 90vw)',
          background: 'var(--hs-surface)',
          borderRadius: 'var(--hs-r-panel)',
          padding: 'var(--hs-sp-10)',
          boxShadow: 'var(--hs-shadow-modal)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'var(--hs-fs-section)', fontWeight: 600 }}>
          توريد — {product.name}
        </h2>
        <p style={{ margin: '5px 0 var(--hs-sp-9)', fontSize: 'var(--hs-fs-label)', color: 'var(--hs-text-muted)' }}>
          الرصيد الحالي <span className="hs-num">{num(product.qtyOnHand)}</span>
        </p>

        <div className="hs-stack" style={{ gap: 'var(--hs-sp-7)' }}>
          <div>
            <label className="hs-field__label" htmlFor="receive-qty">
              الكمية الواردة
            </label>
            <Input
              id="receive-qty"
              className="hs-input hs-num"
              type="number"
              min={1}
              step={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              aria-invalid={invalid}
              autoFocus
            />
            {invalid ? (
              <span className="hs-field__error" role="alert">
                أدخل كمية صحيحة أكبر من صفر.
              </span>
            ) : null}
          </div>

          <div>
            <label className="hs-field__label" htmlFor="receive-supplier">
              المورد
            </label>
            <Input
              id="receive-supplier"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="مثال: الشرق للتوزيع"
            />
          </div>

          <div className="hs-row" style={{ gap: 'var(--hs-sp-4)' }}>
            <Button style={{ flex: 1 }} onClick={onClose}>
              إلغاء
            </Button>
            <Button
              variant="action"
              style={{ flex: 1 }}
              disabled={invalid}
              onClick={() => onSubmit(parsed, supplier.trim())}
            >
              تسجيل التوريد
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
