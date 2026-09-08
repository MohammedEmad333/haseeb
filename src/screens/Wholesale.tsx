/**
 * F. بيع الجملة — wholesale.
 *
 * The tier table is the pricing policy; the slider is the negotiated override
 * for one invoice. Both go through `priceWholesaleLine`, so what the builder
 * shows is exactly what the invoice will charge.
 */

import { useMemo, useState } from 'react';
import { useHaseeb } from '@/state/HaseebProvider';
import { Badge, Button, Card, CardBody, CardHead, EmptyState, RangeSlider } from '@/ui/primitives';
import { AutoGrid, DataTable, InitialTile, PageHeader, type Column } from '@/ui/composites';
import type { Customer, Product } from '@/db/types';
import {
  MAX_CUSTOM_DISCOUNT,
  TIERS,
  priceWholesaleLine,
  tierDiscountPercent,
  type TierName,
} from '@/domain/wholesale';
import { computeTotals } from '@/domain/tax';
import { NOUNS, counted, money, num, percent } from '@/lib/format';

const TIER_TINT: Record<TierName, { bg: string; border: string; fg: string; label: string }> = {
  silver: { bg: 'var(--hs-surface-alt)', border: 'var(--hs-border)', fg: 'var(--hs-text-slate-2)', label: 'شريحة فضية' },
  gold: { bg: 'var(--hs-warn-bg)', border: 'var(--hs-warn-border)', fg: 'var(--hs-warn-text)', label: 'شريحة ذهبية' },
  platinum: { bg: 'var(--hs-mint-bg)', border: 'var(--hs-mint-border)', fg: 'var(--hs-mint-text)', label: 'شريحة بلاتينية' },
};

interface BuilderLine {
  productId: string;
  qty: number;
}

/**
 * A starting basket, so the builder is useful the moment the screen opens.
 *
 * Quantities are clamped to what is actually on hand: quoting 300 units of a
 * product with 90 in the warehouse gives a builder that can never issue its
 * own default invoice. Raising a line past stock is still allowed while
 * quoting — it is blocked at issue, with the shortfall named.
 */
const STARTER: readonly [string, number][] = [
  ['SKU-4501', 300],
  ['SKU-1042', 150],
  ['SKU-1080', 200],
  ['SKU-5020', 600],
];

export function Wholesale() {
  const { customers, products, sales, profile, revision, db } = useHaseeb();
  const [useCustom, setUseCustom] = useState(false);
  const [discount, setDiscount] = useState(12);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [lines, setLines] = useState<BuilderLine[] | null>(null);
  const [issued, setIssued] = useState<string | null>(null);

  const catalogue = useMemo(
    () => products?.list() ?? [],
     
    [products, revision],
  );

  const wholesalers = useMemo(
    () => customers?.list('wholesale') ?? [],
     
    [customers, revision],
  );

  const builderLines = useMemo<BuilderLine[]>(() => {
    if (lines) return lines;
    return STARTER.flatMap(([sku, qty]) => {
      const product = catalogue.find((p) => p.sku === sku);
      if (!product || product.qtyOnHand === 0) return [];
      return [{ productId: product.id, qty: Math.min(qty, product.qtyOnHand) }];
    });
  }, [lines, catalogue]);

  const vatRate = profile?.vatRate ?? 14;
  const unit = profile?.currencyLabel ?? 'ج.م';

  const priced = useMemo(() => {
    const rows = builderLines.flatMap((line) => {
      const product = catalogue.find((p) => p.id === line.productId);
      if (!product) return [];
      const result = priceWholesaleLine({
        unitPrice: wholesaleUnitPrice(product),
        qty: line.qty,
        customDiscountPercent: useCustom ? discount : null,
      });
      return [{ product, ...result }];
    });
    const subtotal = rows.reduce((t, r) => t + r.total, 0);
    return { rows, totals: computeTotals({ subtotal, vatRate }) };
  }, [builderLines, catalogue, useCustom, discount, vatRate]);

  const selected = wholesalers.find((c) => c.id === customerId) ?? null;

  const columns: Column<(typeof priced.rows)[number]>[] = [
    { key: 'name', header: 'الصنف', width: '2fr', render: (r) => r.product.name },
    {
      key: 'qty',
      header: 'الكمية',
      width: '1fr',
      render: (r) => (
        <input
          type="number"
          min={1}
          step={1}
          value={r.qty}
          aria-label={`كمية ${r.product.name}`}
          className="hs-input hs-num"
          style={{ width: 88, minHeight: 36, padding: '6px 10px' }}
          onChange={(event) => {
            const qty = Math.max(1, Math.round(Number(event.target.value) || 1));
            setLines(
              builderLines.map((l) => (l.productId === r.product.id ? { ...l, qty } : l)),
            );
          }}
        />
      ),
    },
    {
      key: 'unit',
      header: 'سعر الوحدة',
      width: '1fr',
      render: (r) => <span className="hs-num">{money(r.unitPrice)}</span>,
    },
    {
      key: 'discount',
      header: 'الخصم',
      width: '1fr',
      render: (r) => (
        <span className="hs-num hs-signed" style={{ color: 'var(--hs-emerald)', fontWeight: 600 }}>
          −{percent(r.discountPercent, r.discountPercent % 1 === 0 ? 0 : 1)}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'الإجمالي',
      width: '1fr',
      render: (r) => <span className="hs-num" style={{ fontWeight: 600 }}>{money(r.total)}</span>,
    },
  ];

  const issue = (): void => {
    if (!sales || priced.rows.length === 0) return;
    const result = sales.checkout({
      lines: priced.rows.map((r) => ({
        productId: r.product.id,
        name: r.product.name,
        qty: r.qty,
        unit: r.unitPrice,
        cost: r.product.cost,
        discountPercent: r.discountPercent,
        discount: r.discount,
      })),
      paymentMethod: 'credit',
      channel: 'wholesale',
      customerId: selected?.id ?? null,
      customerName: selected?.name,
      vatRate,
    });
    void db?.flush();
    setIssued(result.invoice.invoiceNo);
    setLines([]);
  };

  const overStock = priced.rows.find((r) => r.qty > r.product.qtyOnHand);
  const blocked = !selected || priced.rows.length === 0 || Boolean(overStock);

  return (
    <>
      <PageHeader title="بيع الجملة" sub="شرائح الكميات · الخصومات · بناء فاتورة الجملة" />

      {issued ? (
        <div
          role="status"
          style={{
            background: 'var(--hs-mint-bg)',
            color: 'var(--hs-mint-text)',
            border: '1px solid var(--hs-mint-border)',
            borderRadius: 'var(--hs-r-tile)',
            padding: 'var(--hs-sp-6) var(--hs-sp-8)',
            marginBlockEnd: 'var(--hs-sp-7)',
            fontSize: 'var(--hs-fs-body)',
          }}
        >
          صدرت الفاتورة {issued} وسُجِّلت على حساب العميل.
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))',
          gap: 'var(--hs-gap)',
          alignItems: 'start',
          marginBlockEnd: 'var(--hs-sp-8)',
        }}
      >
        <Card panel style={{ minWidth: 0 }}>
          <CardHead title="عملاء الجملة" sub={counted(wholesalers.length, NOUNS.customer)} />
          <CardBody style={{ paddingInline: 0 }}>
            {wholesalers.length === 0 ? (
              <EmptyState title="لا يوجد عملاء جملة" body="أضف عميل جملة لتظهر شريحته وحدّه الأدنى هنا." />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {wholesalers.map((customer) => (
                  <li key={customer.id}>
                    <WholesalerRow
                      customer={customer}
                      selected={customer.id === customerId}
                      onSelect={() => setCustomerId(customer.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <div className="hs-stack" style={{ gap: 'var(--hs-gap)', minWidth: 0 }}>
          <Card panel>
            <CardHead title="شرائح الكميات" sub="الخصم يُطبَّق تلقائياً حسب كمية السطر" />
            <CardBody>
              <AutoGrid min={140} gap="var(--hs-sp-5)">
                {TIERS.map((tier) => {
                  const tint = TIER_TINT[tier.name];
                  return (
                    <div
                      key={tier.name}
                      style={{
                        background: tint.bg,
                        border: `1px solid ${tint.border}`,
                        borderRadius: 'var(--hs-r-tile)',
                        padding: 'var(--hs-sp-6)',
                      }}
                    >
                      <div style={{ fontSize: 'var(--hs-fs-cell)', fontWeight: 600, color: tint.fg }}>
                        {tier.labelAr}
                      </div>
                      <div className="hs-num hs-signed" style={{ fontSize: 'var(--hs-fs-badge)', color: tint.fg, marginBlockStart: 3, opacity: 0.85 }}>
                        {tier.maxQty === null
                          ? `${counted(tier.minQty, NOUNS.unit)} وأكثر`
                          : `${num(tier.minQty)} – ${counted(tier.maxQty, NOUNS.unit)}`}
                      </div>
                      <div className="hs-num" style={{ fontSize: 22, fontWeight: 600, color: tint.fg, marginBlockStart: 'var(--hs-sp-4)' }}>
                        {percent(tier.discountPercent)}
                      </div>
                      <div style={{ fontSize: 'var(--hs-fs-micro)', color: tint.fg, opacity: 0.8 }}>
                        خصم عن سعر التجزئة
                      </div>
                    </div>
                  );
                })}
              </AutoGrid>

              <div
                style={{
                  marginBlockStart: 'var(--hs-sp-8)',
                  background: 'var(--hs-surface-alt)',
                  border: '1px solid var(--hs-border)',
                  borderRadius: 'var(--hs-r-tile)',
                  padding: 'var(--hs-sp-8)',
                }}
              >
                <div className="hs-row" style={{ justifyContent: 'space-between', gap: 'var(--hs-sp-5)' }}>
                  <label className="hs-row" style={{ gap: 'var(--hs-sp-4)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={useCustom}
                      onChange={(event) => setUseCustom(event.target.checked)}
                      style={{ width: 18, height: 18, accentColor: 'var(--hs-emerald)' }}
                    />
                    <span style={{ fontSize: 'var(--hs-fs-cell)', fontWeight: 600 }}>
                      خصم مخصّص لهذه الفاتورة
                    </span>
                  </label>
                  <span className="hs-num" style={{ fontSize: 15, fontWeight: 600, color: 'var(--hs-emerald)' }}>
                    {percent(useCustom ? discount : 0)}
                  </span>
                </div>

                <div style={{ marginBlockStart: 'var(--hs-sp-3)' }}>
                  <RangeSlider
                    label="نسبة الخصم المخصّص"
                    value={discount}
                    min={0}
                    max={MAX_CUSTOM_DISCOUNT}
                    disabled={!useCustom}
                    onChange={setDiscount}
                  />
                </div>
                <p style={{ margin: 0, fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-text-muted)', lineHeight: 1.7 }}>
                  الخصم المخصّص يحلّ محل خصم الشريحة ولا يُضاف إليه، حتى لا يُطبَّق خصمان على السطر
                  نفسه.
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <Card panel>
        <CardHead
          title="بناء فاتورة الجملة"
          sub={selected ? `العميل: ${selected.name}` : 'اختر عميل جملة من القائمة أعلاه'}
          actions={
            <Button variant="primary" disabled={blocked} onClick={issue}>
              إصدار الفاتورة
            </Button>
          }
        />
        <DataTable
          caption="سطور فاتورة الجملة"
          columns={columns}
          rows={priced.rows}
          rowKey={(r) => r.product.id}
          empty={<EmptyState title="لا توجد سطور" body="أضف أصنافاً من المخزن لبناء فاتورة جملة." />}
        />

        {overStock ? (
          <div style={{ padding: 'var(--hs-sp-6) var(--hs-sp-9)' }}>
            <span className="hs-field__error" role="alert">
              الكمية المطلوبة من «{overStock.product.name}» تتجاوز الرصيد المتاح (
              <span className="hs-num">{num(overStock.product.qtyOnHand)}</span>).
            </span>
          </div>
        ) : null}

        <div
          className="hs-row"
          style={{
            justifyContent: 'flex-end',
            gap: 'var(--hs-sp-11)',
            padding: 'var(--hs-sp-8) var(--hs-sp-9)',
            borderBlockStart: '1px solid var(--hs-divider)',
            flexWrap: 'wrap',
          }}
        >
          <Total label="المجموع قبل الضريبة" value={money(priced.totals.taxable)} />
          <Total label={`ضريبة القيمة المضافة ${percent(vatRate, vatRate % 1 === 0 ? 0 : 1)}`} value={money(priced.totals.vat)} />
          <Total label="الإجمالي المستحق" value={`${money(priced.totals.total)} ${unit}`} strong />
        </div>
      </Card>
    </>
  );
}

/**
 * Wholesale starts from the retail price; the tier discount is what makes it
 * a wholesale price, so there is no second price list to keep in sync.
 */
function wholesaleUnitPrice(product: Product): number {
  return product.price;
}

function WholesalerRow({
  customer,
  selected,
  onSelect,
}: {
  customer: Customer;
  selected: boolean;
  onSelect: () => void;
}) {
  const tint = customer.tier ? TIER_TINT[customer.tier] : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected}
      className="hs-row"
      style={{
        width: '100%',
        gap: 'var(--hs-sp-5)',
        padding: 'var(--hs-sp-5) var(--hs-sp-9)',
        border: 'none',
        borderBlockEnd: '1px solid var(--hs-divider)',
        background: selected ? 'var(--hs-surface-alt)' : 'transparent',
        cursor: 'pointer',
        font: 'inherit',
        textAlign: 'start',
        minHeight: 'var(--hs-touch)',
      }}
    >
      <InitialTile name={customer.name} size={36} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 'var(--hs-fs-body-lg)', fontWeight: 600 }}>
          {customer.name}
        </span>
        <span style={{ display: 'block', fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-text-subtle)', marginBlockStart: 2 }}>
          {customer.city} · حد أدنى <span className="hs-num">{num(customer.minOrderQty)}</span> وحدة ·
          خصم <span className="hs-num">{percent(tierDiscountPercent(customer.minOrderQty))}</span>
        </span>
      </span>
      {tint ? (
        <Badge bg={tint.bg} fg={tint.fg}>
          {tint.label}
        </Badge>
      ) : null}
    </button>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ textAlign: 'end' }}>
      <div style={{ fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-text-muted)' }}>{label}</div>
      <div
        className="hs-num"
        style={{ fontSize: strong ? 20 : 15, fontWeight: 600, color: strong ? 'var(--hs-emerald)' : 'var(--hs-ink)', marginBlockStart: 2 }}
      >
        {value}
      </div>
    </div>
  );
}
