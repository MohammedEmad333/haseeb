/**
 * H. الطلبات والفواتير — customer orders, supplier purchase orders, and the
 * printable tax invoice beside them.
 */

import { useState } from 'react';
import { useHaseeb } from '@/state/HaseebProvider';
import { useQuery } from '@/state/useQuery';
import { Badge, Button, Card, CardBody, CardHead, EmptyState, Tabs } from '@/ui/primitives';
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

  const { data: view } = useQuery(async () => {
    if (!ops || !sales) return null;
    return { orders: await ops.orders(direction), invoice: await sales.latestInvoice() };
  }, [ops, sales, direction]);

  if (!view) return null;
  const unit = profile?.currencyLabel ?? 'ج.م';

  return (
    <>
      <PageHeader title="الطلبات والفواتير" sub="طلبات العملاء وأوامر التوريد · الفاتورة الضريبية" />

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
    </>
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
        <span
          className="hs-num"
          style={{ display: 'block', fontSize: 'var(--hs-fs-meta)', color: 'var(--hs-text-subtle)', marginBlockStart: 2 }}
        >
          {order.itemCount > 0 ? `${counted(order.itemCount, NOUNS.item)} · ` : ''}
          {dateAndTime(order.placedAt)}
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
