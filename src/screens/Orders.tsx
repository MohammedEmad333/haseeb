/**
 * H. الطلبات والفواتير — customer orders, supplier purchase orders, and the
 * printable tax invoice beside them.
 */

import { useState } from 'react';
import { useHaseeb } from '@/state/HaseebProvider';
import { useQuery } from '@/state/useQuery';
import { Badge, Button, Card, CardBody, CardHead, EmptyState, Input, Tabs } from '@/ui/primitives';
import { PageHeader } from '@/ui/composites';
import { TaxInvoice } from '@/screens/parts/TaxInvoice';
import { ORDER_STATUS_LABEL } from '@/db/repositories/operations';
import type { Order, OrderDirection, OrderStatus } from '@/db/types';
import { NOUNS, counted, dateAndTime, money } from '@/lib/format';

const STATUS_TINT: Record<OrderStatus, { bg: string; fg: string; bar: string }> = {
  completed: { bg: 'var(--hs-mint-bg)', fg: 'var(--hs-mint-text)', bar: 'var(--hs-emerald)' },
  received: { bg: 'var(--hs-page)', fg: 'var(--hs-text-slate-2)', bar: 'var(--hs-ink)' },
  preparing: { bg: 'var(--hs-warn-bg)', fg: 'var(--hs-warn-text)', bar: 'var(--hs-warn-solid)' },
  awaitingShipment: { bg: 'var(--hs-warn-bg)', fg: 'var(--hs-warn-text)', bar: 'var(--hs-warn-solid)' },
  cancelled: { bg: 'var(--hs-danger-bg)', fg: 'var(--hs-danger-text)', bar: 'var(--hs-danger-solid)' },
};

/** The status an order can legitimately be advanced to from where it is. */
const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  preparing: 'completed',
  awaitingShipment: 'received',
};

export function Orders() {
  const { ops, sales, profile, db } = useHaseeb();
  const [direction, setDirection] = useState<OrderDirection>('customer');
  const [creating, setCreating] = useState(false);

  const { data: view } = useQuery(async () => {
    if (!ops || !sales) return null;
    return { orders: await ops.orders(direction), invoice: await sales.latestInvoice() };
  }, [ops, sales, direction]);

  if (!view) return null;
  const unit = profile?.currencyLabel ?? '₪';

  return (
    <>
      <PageHeader
        title="الطلبات والفواتير"
        sub="طلبات العملاء وأوامر التوريد · الفاتورة الضريبية"
        actions={<Button variant="action" onClick={() => setCreating(true)}>+ طلب جديد</Button>}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))',
          gap: 'var(--hs-gap)',
          alignItems: 'start',
        }}
      >
        <Card panel style={{ minWidth: 0 }}>
          <CardHead
            title="الطلبات"
            sub={`${counted(view.orders.length, NOUNS.order)} · بالـ${unit}`}
            actions={
              <Tabs
                label="نوع الطلبات"
                value={direction}
                onChange={setDirection}
                tabs={[
                  { value: 'customer', label: 'طلبات العملاء' },
                  { value: 'supplier', label: 'طلبات الموردين' },
                ]}
              />
            }
          />
          <CardBody style={{ paddingInline: 0 }}>
            <div role="tabpanel" id={`panel-${direction}`} aria-labelledby={`tab-${direction}`}>
              {view.orders.length === 0 ? (
                <EmptyState
                  title={direction === 'customer' ? 'لا توجد طلبات عملاء' : 'لا توجد أوامر توريد'}
                  body="الطلبات الجديدة تظهر هنا مع حالتها وقيمتها وموعد التسليم."
                />
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {view.orders.map((order) => (
                    <li key={order.id}>
                      <OrderRow
                        order={order}
                        onAdvance={async () => {
                          const next = NEXT_STATUS[order.status];
                          if (!next) return;
                          await ops!.setOrderStatus(order.id, next);
                          await db?.flush();
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardBody>
        </Card>

        <div style={{ minWidth: 0 }}>
          {view.invoice ? (
            <TaxInvoice invoice={view.invoice} profile={profile} />
          ) : (
            <Card panel>
              <EmptyState
                title="لا توجد فاتورة لعرضها"
                body="أتمم عملية بيع من شاشة البيع المباشر لتظهر آخر فاتورة ضريبية هنا جاهزة للطباعة."
              />
            </Card>
          )}
        </div>
      </div>

      {creating ? (
        <CreateOrderDialog
          direction={direction}
          unit={unit}
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            await ops!.createOrder(input);
            await db?.flush();
            setCreating(false);
          }}
        />
      ) : null}
    </>
  );
}

function CreateOrderDialog({
  direction,
  unit,
  onClose,
  onSubmit,
}: {
  direction: OrderDirection;
  unit: string;
  onClose: () => void;
  onSubmit: (input: Parameters<NonNullable<ReturnType<typeof useHaseeb>['ops']>['createOrder']>[0]) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [itemCount, setItemCount] = useState('1');
  const [total, setTotal] = useState('');
  const [fulfilment, setFulfilment] = useState('');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <div className="hs-dialog-scrim" role="presentation" onMouseDown={onClose}>
      <form
        className="hs-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="إضافة طلب"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          setSaving(true);
          try {
            await onSubmit({
              direction,
              counterpartyName: name,
              itemCount: Number(itemCount),
              total: Math.round(Number(total) * 100),
              fulfilment,
              summary,
            });
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'تعذّر حفظ الطلب.');
          } finally {
            setSaving(false);
          }
        }}
      >
        <CardHead
          title={direction === 'supplier' ? 'أمر توريد جديد' : 'طلب عميل جديد'}
          sub="يُحفظ الطلب محلياً ويظهر مباشرة في المتابعة"
          actions={<Button size="sm" onClick={onClose}>إغلاق</Button>}
        />
        <div className="hs-form-grid">
          <label>اسم {direction === 'supplier' ? 'المورد' : 'العميل'}<Input required value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>عدد الأصناف<Input required min="1" step="1" type="number" value={itemCount} onChange={(e) => setItemCount(e.target.value)} /></label>
          <label>الإجمالي ({unit})<Input required min="0" step="0.01" type="number" value={total} onChange={(e) => setTotal(e.target.value)} /></label>
          <label>التسليم<Input value={fulfilment} onChange={(e) => setFulfilment(e.target.value)} placeholder="مثال: اليوم مساءً" /></label>
          <label style={{ gridColumn: '1 / -1' }}>ملخص الأصناف<Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="وصف مختصر للطلب" /></label>
        </div>
        {error ? <p role="alert" style={{ color: 'var(--hs-danger-text)' }}>{error}</p> : null}
        <Button type="submit" variant="action" block disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ الطلب'}</Button>
      </form>
    </div>
  );
}

function OrderRow({ order, onAdvance }: { order: Order; onAdvance: () => void | Promise<void> }) {
  const tint = STATUS_TINT[order.status];
  const next = NEXT_STATUS[order.status];
  const prefix = order.direction === 'supplier' ? 'أمر توريد' : 'طلب';

  return (
    <div
      className="hs-row"
      style={{
        gap: 'var(--hs-sp-5)',
        padding: 'var(--hs-sp-5) var(--hs-sp-9)',
        borderBlockEnd: '1px solid var(--hs-divider)',
      }}
    >
      <span aria-hidden style={{ width: 8, height: 34, borderRadius: 4, background: tint.bar, flex: 'none' }} />

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 'var(--hs-fs-body-lg)', fontWeight: 600 }}>
          {prefix} #{order.orderNo} — {order.counterpartyName}
        </span>
        {/* Each figure is its own numeric run: .hs-num does not break inside
            a number, so wrapping the whole meta line in it made a three-part
            sentence unbreakable and scrolled a narrow screen sideways. */}
        <span
          style={{ display: 'block', fontSize: 'var(--hs-fs-meta)', color: 'var(--hs-text-subtle)', marginBlockStart: 2 }}
        >
          {order.itemCount > 0 ? (
            <>
              <span className="hs-num">{counted(order.itemCount, NOUNS.item)}</span>
              {' · '}
            </>
          ) : null}
          <span className="hs-num">{dateAndTime(order.placedAt)}</span>
          {order.fulfilment ? ` · ${order.fulfilment}` : ''}
        </span>
      </span>

      <Badge bg={tint.bg} fg={tint.fg}>
        {ORDER_STATUS_LABEL[order.status]}
      </Badge>

      <span className="hs-num" style={{ fontSize: 14, fontWeight: 600, minWidth: 78, textAlign: 'end' }}>
        {money(order.total)}
      </span>

      {next ? (
        <Button size="sm" onClick={() => void onAdvance()}>
          {ORDER_STATUS_LABEL[next]}
        </Button>
      ) : null}
    </div>
  );
}
