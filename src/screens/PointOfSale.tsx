/**
 * D. البيع المباشر — the cashier screen.
 *
 * Scan or search adds a line, the steppers adjust it, «إتمام الدفع» closes
 * the sale and «تسجيل كدين» posts it to the debt ledger instead of taking
 * payment. Both routes go through one repository call, so stock, invoice,
 * audit trail and — for a credit sale — the debt all move together or not
 * at all.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useHaseeb } from '@/state/HaseebProvider';
import { Button, Card, CardHead, EmptyState, ErrorState, Input, Select } from '@/ui/primitives';
import { DataTable, PageHeader, type Column } from '@/ui/composites';
import type { CartLine } from '@/db/repositories/sales';
import type { PaymentMethod, Product } from '@/db/types';
import { computeTotals } from '@/domain/tax';
import { money, moneyRounded, num, percent, timeAndDate } from '@/lib/format';
import { marginPercent } from '@/domain/inventory';

const PAYMENT_TINT: Record<PaymentMethod, { bg: string; fg: string; label: string }> = {
  cash: { bg: 'var(--hs-mint-bg)', fg: 'var(--hs-mint-text)', label: 'نقدي' },
  wallet: { bg: 'var(--hs-page)', fg: 'var(--hs-text-slate-2)', label: 'محفظة' },
  card: { bg: 'var(--hs-page)', fg: 'var(--hs-text-slate-2)', label: 'بطاقة' },
  credit: { bg: 'var(--hs-danger-bg)', fg: 'var(--hs-danger-text)', label: 'آجل' },
};

export function PointOfSale() {
  const { products, sales, customers, analytics, profile, revision, search, setSearch, db } =
    useHaseeb();

  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const view = useMemo(() => {
    if (!products || !sales || !analytics || !customers) return null;
    const asOf = new Date();
    const today = analytics.todayTotals(asOf);
    const week = analytics.weekTotals(asOf);
    return {
      catalogue: products.search(search),
      log: sales.recentSaleLines(8),
      creditCustomers: customers.list('retail').concat(customers.list('wholesale')),
      today,
      weekCollected: analytics.collectedBetween(
        startOfWeek(asOf).toISOString(),
        endOfToday(asOf).toISOString(),
      ),
      margin: marginPercent(week.sales, week.profit),
    };
     
  }, [products, sales, analytics, customers, search, revision]);

  const vatRate = profile?.vatRate ?? 14;
  const unit = profile?.currencyLabel ?? 'ج.م';

  const totals = useMemo(
    () =>
      computeTotals({
        subtotal: cart.reduce((t, line) => t + line.qty * line.unit, 0),
        vatRate,
      }),
    [cart, vatRate],
  );

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(timer);
  }, [flash]);

  if (!view) return null;

  const addToCart = (p: Product): void => {
    setError(null);
    setCart((current) => {
      const existing = current.find((line) => line.productId === p.id);
      const wanted = (existing?.qty ?? 0) + 1;
      if (wanted > p.qtyOnHand) {
        setError(`الكمية المتاحة من «${p.name}» ${num(p.qtyOnHand)} فقط.`);
        return current;
      }
      if (existing) {
        return current.map((line) =>
          line.productId === p.id ? { ...line, qty: line.qty + 1 } : line,
        );
      }
      return [
        ...current,
        { productId: p.id, name: p.name, qty: 1, unit: p.price, cost: p.cost },
      ];
    });
  };

  const setQty = (productId: string, qty: number): void => {
    setError(null);
    if (qty <= 0) {
      setCart((current) => current.filter((line) => line.productId !== productId));
      return;
    }
    const stock = products!.byId(productId)?.qtyOnHand ?? 0;
    if (qty > stock) {
      setError(`الكمية المتاحة ${num(stock)} فقط.`);
      return;
    }
    setCart((current) =>
      current.map((line) => (line.productId === productId ? { ...line, qty } : line)),
    );
  };

  const checkout = (paymentMethod: PaymentMethod): void => {
    setError(null);
    if (cart.length === 0) {
      setError('أضف صنفاً واحداً على الأقل قبل إتمام الدفع.');
      return;
    }
    if (paymentMethod === 'credit' && !customerId) {
      setError('اختر العميل قبل تسجيل البيع كدين.');
      return;
    }
    try {
      const result = sales!.checkout({
        lines: cart,
        paymentMethod,
        customerId: paymentMethod === 'credit' ? customerId : null,
        customerName: view.creditCustomers.find((c) => c.id === customerId)?.name,
        vatRate,
      });
      setCart([]);
      setCustomerId('');
      void db?.flush();
      setFlash(
        paymentMethod === 'credit'
          ? `سُجِّلت الفاتورة ${result.invoice.invoiceNo} كدين على العميل.`
          : `تم الدفع — فاتورة ${result.invoice.invoiceNo} بمبلغ ${money(result.invoice.total)} ${unit}.`,
      );
      scanRef.current?.focus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر إتمام العملية.');
    }
  };

  const logColumns: Column<(typeof view.log)[number]>[] = [
    { key: 'item', header: 'الصنف', width: '2fr', render: (r) => r.name },
    {
      key: 'qty',
      header: 'الكمية',
      width: '0.7fr',
      render: (r) => <span className="hs-num">{num(r.qty)}</span>,
    },
    {
      key: 'time',
      header: 'وقت وتاريخ البيع',
      width: '1.3fr',
      render: (r) => (
        <span className="hs-num" style={{ color: 'var(--hs-text-muted)' }}>
          {timeAndDate(r.occurredAt)}
        </span>
      ),
    },
    {
      key: 'pay',
      header: 'طريقة الدفع',
      width: '1fr',
      render: (r) => {
        const tint = PAYMENT_TINT[r.paymentMethod];
        return (
          <span
            className="hs-badge"
            style={{ background: tint.bg, color: tint.fg }}
          >
            {tint.label}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="البيع المباشر"
        sub="نقطة بيع سريعة · وضع الكاشير"
        actions={
          <div className="hs-row" style={{ gap: 'var(--hs-sp-4)', flexWrap: 'wrap' }}>
            <Counter label="المصاري اليومية" value={moneyRounded(view.today.sales)} />
            <Counter label="محصول الأسبوع" value={moneyRounded(view.weekCollected)} />
            <Counter label="نسبة الربح" value={percent(Math.round(view.margin))} accent />
          </div>
        }
      />

      {flash ? (
        <div
          role="status"
          className="hs-badge"
          style={{
            background: 'var(--hs-mint-bg)',
            color: 'var(--hs-mint-text)',
            padding: 'var(--hs-sp-5) var(--hs-sp-8)',
            borderRadius: 'var(--hs-r-tile)',
            marginBlockEnd: 'var(--hs-sp-7)',
            fontSize: 'var(--hs-fs-body)',
          }}
        >
          {flash}
        </div>
      ) : null}

      {error ? (
        <div style={{ marginBlockEnd: 'var(--hs-sp-7)' }}>
          <ErrorState title="تعذّر إتمام العملية" detail={error} />
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.7fr) minmax(0, 1fr)',
          gap: 'var(--hs-gap)',
          alignItems: 'start',
        }}
        className="hs-pos-split"
      >
        <div className="hs-stack" style={{ gap: 'var(--hs-gap)', minWidth: 0 }}>
          <Card style={{ padding: 13 }}>
            <div className="hs-row" style={{ gap: 'var(--hs-sp-5)', flexWrap: 'wrap' }}>
              <div
                className="hs-row"
                style={{
                  flex: 1,
                  minWidth: 220,
                  gap: 'var(--hs-sp-5)',
                  background: 'var(--hs-surface-alt)',
                  border: '1px solid var(--hs-border)',
                  borderRadius: 'var(--hs-r-control)',
                  paddingInline: 'var(--hs-sp-6)',
                }}
              >
                <BarcodeGlyph />
                <Input
                  ref={scanRef}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    // A barcode scanner types the code and presses Enter; if
                    // the search resolved to one product, that is the scan.
                    if (event.key === 'Enter' && view.catalogue.length === 1) {
                      addToCart(view.catalogue[0]);
                      setSearch('');
                    }
                  }}
                  placeholder="امسح الباركود أو اكتب اسم الصنف…"
                  aria-label="مسح الباركود أو البحث عن صنف"
                  style={{ background: 'transparent', border: 'none' }}
                />
              </div>
              <Button variant="action" onClick={() => scanRef.current?.focus()}>
                تشغيل الماسح
              </Button>
            </div>
          </Card>

          {view.catalogue.length === 0 ? (
            <Card>
              <EmptyState
                title="لا توجد أصناف مطابقة"
                body="جرّب اسماً آخر أو امسح الباركود مباشرة. يمكنك إضافة أصناف جديدة من شاشة المخزن."
              />
            </Card>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(138px, 100%), 1fr))',
                gap: 11,
              }}
            >
              {view.catalogue.map((p) => (
                <ProductCard key={p.id} product={p} unit={unit} onAdd={() => addToCart(p)} />
              ))}
            </div>
          )}

          <Card panel>
            <CardHead
              title="سجل البيع المباشر"
              actions={
                <span style={{ fontSize: 'var(--hs-fs-meta)', color: 'var(--hs-emerald)' }}>
                  يُحدَّث تلقائياً
                </span>
              }
            />
            <DataTable
              caption="آخر عمليات البيع"
              columns={logColumns}
              rows={view.log}
              rowKey={(r) => r.id}
              empty={
                <EmptyState
                  title="لم تُسجَّل مبيعات بعد"
                  body="أول عملية بيع ستظهر هنا مباشرة مع وقتها وطريقة الدفع."
                />
              }
            />
          </Card>
        </div>

        <CartPanel
          cart={cart}
          totals={totals}
          vatRate={vatRate}
          unit={unit}
          invoiceNo={sales!.nextInvoiceNo()}
          customerId={customerId}
          customers={view.creditCustomers}
          onCustomer={setCustomerId}
          onQty={setQty}
          onCheckout={checkout}
        />
      </div>

      <style>{`
        @media (max-width: 1100px) {
          .hs-pos-split { grid-template-columns: minmax(0, 1fr) !important; }
        }
      `}</style>
    </>
  );
}

// ---------------------------------------------------------------------------

function Counter({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      style={{
        background: 'var(--hs-ink)',
        borderRadius: 'var(--hs-r-tile)',
        padding: '10px 16px',
        minWidth: 148,
      }}
    >
      <div style={{ fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-on-dark-subtle)' }}>{label}</div>
      <div
        className="hs-num"
        style={{
          fontSize: 17,
          fontWeight: 600,
          color: accent ? 'var(--hs-mint)' : 'var(--hs-on-dark)',
          marginBlockStart: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function BarcodeGlyph() {
  return (
    <span aria-hidden className="hs-row" style={{ gap: 2, flex: 'none' }}>
      {[2, 1, 3, 1, 2].map((w, i) => (
        <span key={i} style={{ width: w, height: 15, background: 'var(--hs-text-subtle)', borderRadius: 1 }} />
      ))}
    </span>
  );
}

function ProductCard({
  product,
  unit,
  onAdd,
}: {
  product: Product;
  unit: string;
  onAdd: () => void;
}) {
  const outOfStock = product.qtyOnHand === 0;
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={outOfStock}
      className="hs-card hs-card--lift"
      style={{
        padding: 12,
        borderRadius: 15,
        textAlign: 'start',
        font: 'inherit',
        cursor: outOfStock ? 'not-allowed' : 'pointer',
        opacity: outOfStock ? 0.55 : 1,
      }}
      aria-label={`إضافة ${product.name} إلى الفاتورة`}
    >
      <span
        aria-hidden
        style={{
          display: 'grid',
          placeItems: 'center',
          height: 60,
          borderRadius: 'var(--hs-r-control-sm)',
          background: 'repeating-linear-gradient(135deg,#F1F5F9 0 7px,#E8EEF4 7px 14px)',
          fontSize: 9.5,
          color: 'var(--hs-text-subtle)',
          fontFamily: 'var(--hs-font-mono)',
          marginBlockEnd: 'var(--hs-sp-4)',
        }}
      >
        صورة الصنف
      </span>
      <span style={{ display: 'block', fontSize: 'var(--hs-fs-body)', fontWeight: 500 }}>
        {product.name}
      </span>
      <span
        className="hs-num"
        style={{ display: 'block', fontSize: 'var(--hs-fs-body)', fontWeight: 600, color: 'var(--hs-emerald)', marginBlockStart: 5 }}
      >
        {money(product.price)} {unit}
      </span>
      <span
        className="hs-num"
        style={{ display: 'block', fontSize: 'var(--hs-fs-micro)', color: 'var(--hs-text-subtle)', marginBlockStart: 3 }}
      >
        المتاح {num(product.qtyOnHand)}
      </span>
    </button>
  );
}

function CartPanel({
  cart,
  totals,
  vatRate,
  unit,
  invoiceNo,
  customerId,
  customers,
  onCustomer,
  onQty,
  onCheckout,
}: {
  cart: readonly CartLine[];
  totals: ReturnType<typeof computeTotals>;
  vatRate: number;
  unit: string;
  invoiceNo: string;
  customerId: string;
  customers: readonly { id: string; name: string }[];
  onCustomer: (id: string) => void;
  onQty: (productId: string, qty: number) => void;
  onCheckout: (method: PaymentMethod) => void;
}) {
  return (
    <Card
      dark
      panel
      style={{ position: 'sticky', insetBlockStart: 82, padding: 'var(--hs-sp-9)', minWidth: 0 }}
    >
      <div className="hs-row" style={{ justifyContent: 'space-between', marginBlockEnd: 'var(--hs-sp-8)' }}>
        <h2 style={{ margin: 0, fontSize: 'var(--hs-fs-section)', fontWeight: 600, color: 'var(--hs-on-dark)' }}>
          الفاتورة الحالية
        </h2>
        <span className="hs-num" style={{ fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-on-dark-subtle)' }}>
          #{invoiceNo}
        </span>
      </div>

      {cart.length === 0 ? (
        <p style={{ fontSize: 'var(--hs-fs-body)', color: 'var(--hs-on-dark-subtle)', lineHeight: 1.8, margin: 0 }}>
          الفاتورة فارغة. امسح باركود أو اختر صنفاً من الشبكة لبدء البيع.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--hs-sp-5)' }}>
          {cart.map((line) => (
            <li key={line.productId} className="hs-row" style={{ gap: 'var(--hs-sp-5)' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 'var(--hs-fs-cell)', color: 'var(--hs-on-dark)' }}>
                  {line.name}
                </span>
                <span
                  className="hs-num"
                  style={{ display: 'block', fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-on-dark-subtle)', marginBlockStart: 2 }}
                >
                  {money(line.unit)} × {num(line.qty)}
                </span>
              </span>

              <span
                className="hs-row"
                style={{
                  gap: 'var(--hs-sp-3)',
                  background: 'rgba(248,250,252,.07)',
                  borderRadius: 'var(--hs-r-control-sm)',
                  padding: '2px 4px',
                }}
              >
                <Stepper label={`إنقاص ${line.name}`} onClick={() => onQty(line.productId, line.qty - 1)}>
                  −
                </Stepper>
                <span className="hs-num" style={{ minWidth: 22, textAlign: 'center', color: 'var(--hs-on-dark)', fontSize: 'var(--hs-fs-cell)' }}>
                  {num(line.qty)}
                </span>
                <Stepper
                  label={`زيادة ${line.name}`}
                  accent
                  onClick={() => onQty(line.productId, line.qty + 1)}
                >
                  +
                </Stepper>
              </span>

              <span className="hs-num" style={{ minWidth: 64, textAlign: 'end', fontWeight: 600, color: 'var(--hs-on-dark)', fontSize: 'var(--hs-fs-cell)' }}>
                {money(line.qty * line.unit)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginBlockStart: 'var(--hs-sp-9)', display: 'grid', gap: 'var(--hs-sp-4)' }}>
        <TotalRow label="المجموع الفرعي" value={money(totals.taxable)} />
        <TotalRow label={`الضريبة ${percent(vatRate, vatRate % 1 === 0 ? 0 : 1)}`} value={money(totals.vat)} />
        {totals.discount > 0 ? (
          <TotalRow label="خصم" value={`−${money(totals.discount)}`} accent />
        ) : null}
      </div>

      <hr style={{ border: 0, borderBlockStart: '1px dashed rgba(248,250,252,.2)', margin: 'var(--hs-sp-8) 0' }} />

      <div className="hs-row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 'var(--hs-fs-body)', color: 'var(--hs-on-dark-muted)' }}>الإجمالي المستحق</span>
        <span className="hs-num" style={{ fontSize: 26, fontWeight: 600, color: 'var(--hs-on-dark)' }}>
          {money(totals.total)}
        </span>
      </div>
      <div style={{ fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-on-dark-subtle)', textAlign: 'end', marginBlockStart: 2 }}>
        {unit}
      </div>

      <div style={{ marginBlockStart: 'var(--hs-sp-9)', display: 'grid', gap: 'var(--hs-sp-5)' }}>
        <Select
          value={customerId}
          onChange={(event) => onCustomer(event.target.value)}
          aria-label="العميل (مطلوب للبيع الآجل)"
          style={{
            background: 'rgba(248,250,252,.07)',
            borderColor: 'rgba(248,250,252,.16)',
            color: 'var(--hs-on-dark)',
          }}
        >
          <option value="">عميل نقدي (بدون تسجيل)</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id} style={{ color: 'var(--hs-ink)' }}>
              {c.name}
            </option>
          ))}
        </Select>

        <div className="hs-row" style={{ gap: 'var(--hs-sp-4)' }}>
          <Button variant="glass" style={{ flex: 1 }} onClick={() => onCheckout('credit')}>
            تسجيل كدين
          </Button>
          <Button variant="mint" style={{ flex: 1 }} onClick={() => onCheckout('cash')}>
            إتمام الدفع
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Stepper({
  children,
  onClick,
  label,
  accent,
}: {
  children: string;
  onClick: () => void;
  label: string;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        width: 26,
        height: 26,
        border: 'none',
        background: 'transparent',
        color: accent ? 'var(--hs-mint)' : 'var(--hs-on-dark-muted)',
        fontSize: 16,
        lineHeight: 1,
        cursor: 'pointer',
        borderRadius: 6,
      }}
    >
      {children}
    </button>
  );
}

function TotalRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="hs-row" style={{ justifyContent: 'space-between' }}>
      <span style={{ fontSize: 'var(--hs-fs-cell)', color: 'var(--hs-on-dark-subtle)' }}>{label}</span>
      <span
        className="hs-num"
        style={{ fontSize: 'var(--hs-fs-cell)', color: accent ? 'var(--hs-mint)' : 'var(--hs-on-dark-muted)' }}
      >
        {value}
      </span>
    </div>
  );
}

function startOfWeek(asOf: Date): Date {
  const d = new Date(asOf.getTime());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 6);
  return d;
}

function endOfToday(asOf: Date): Date {
  const d = new Date(asOf.getTime());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d;
}
