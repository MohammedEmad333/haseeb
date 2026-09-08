/**
 * G. دفتر الديون — the debt ledger.
 *
 * Four position cards, the debtor list, and a profile panel with the
 * customer's full payment history. The reminder buttons open WhatsApp and
 * the SMS composer with a templated Arabic message — deep links, so they
 * work without the app itself having any network access.
 */

import { useMemo, useState } from 'react';
import { useHaseeb } from '@/state/HaseebProvider';
import { Badge, Button, Card, CardBody, CardHead, EmptyState, Input, Tabs } from '@/ui/primitives';
import { AutoGrid, InitialTile, PageHeader, StatTile, Timeline } from '@/ui/composites';
import type { DebtorSummary } from '@/db/repositories/customers';
import { DEBT_STATUS_LABEL, type DebtStatus } from '@/domain/debts';
import { dateShort, money, num } from '@/lib/format';
import { smsHref, whatsappHref } from '@/lib/reminders';

const STATUS_TINT: Record<DebtStatus, { bg: string; fg: string; amount: string }> = {
  overdue: { bg: 'var(--hs-danger-bg)', fg: 'var(--hs-danger-solid)', amount: 'var(--hs-danger-text)' },
  dueSoon: { bg: 'var(--hs-warn-bg)', fg: 'var(--hs-warn-strong)', amount: 'var(--hs-warn-strong)' },
  current: { bg: 'var(--hs-page)', fg: 'var(--hs-text-slate-2)', amount: 'var(--hs-ink)' },
  paid: { bg: 'var(--hs-mint-bg)', fg: 'var(--hs-emerald)', amount: 'var(--hs-mint-text)' },
};

type Direction = 'receivable' | 'payable';

export function Debts() {
  const { customers, profile, revision, db } = useHaseeb();
  const [direction, setDirection] = useState<Direction>('receivable');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paying, setPaying] = useState<DebtorSummary | null>(null);

  const view = useMemo(() => {
    if (!customers) return null;
    const list = customers.debtors(direction).filter((d) => d.outstanding > 0 || d.aging.status === 'paid');
    return { totals: customers.debtTotals(), list };
     
  }, [customers, direction, revision]);

  if (!view) return null;

  const unit = profile?.currencyLabel ?? 'ج.م';
  const selected = view.list.find((d) => d.id === selectedId) ?? view.list[0] ?? null;

  return (
    <>
      <PageHeader title="دفتر الديون" sub="المدينون والدائنون · المتأخرات والتحصيل" />

      <AutoGrid min={186} style={{ marginBlockEnd: 'var(--hs-sp-8)' }}>
        <StatTile
          label="مستحق لك (مدينون)"
          value={money(view.totals.receivable, 0)}
          note={`${num(view.totals.receivableCount)} عميلاً`}
          bg="var(--hs-danger-bg)"
          border="var(--hs-danger-border)"
          labelFg="var(--hs-danger-deep)"
          valueFg="var(--hs-danger-text)"
        />
        <StatTile
          label="مستحق عليك (دائنون)"
          value={money(view.totals.payable, 0)}
          note={`${num(view.totals.payableCount)} موردين`}
          bg="var(--hs-mint-bg)"
          border="var(--hs-mint-border)"
          labelFg="var(--hs-emerald-deep)"
          valueFg="var(--hs-mint-text)"
        />
        <StatTile
          label="متأخر السداد"
          value={money(view.totals.overdue, 0)}
          note={`${num(view.totals.overdueCount)} عملاء`}
          bg="var(--hs-warn-bg)"
          border="var(--hs-warn-border)"
          labelFg="var(--hs-warn-text)"
          valueFg="var(--hs-warn-strong)"
        />
        <StatTile
          label="محصّل هذا الشهر"
          value={money(view.totals.collectedThisMonth, 0)}
          note={`${num(view.totals.collectedCount)} سداداً`}
          bg="var(--hs-surface)"
          border="var(--hs-border-card)"
          labelFg="var(--hs-text-muted)"
          valueFg="var(--hs-ink)"
        />
      </AutoGrid>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(330px, 100%), 1fr))',
          gap: 'var(--hs-gap)',
          alignItems: 'start',
        }}
      >
        <Card panel style={{ minWidth: 0 }}>
          <CardHead
            title="قائمة الحسابات"
            actions={
              <Tabs
                label="اتجاه الدين"
                value={direction}
                onChange={(next) => {
                  setDirection(next);
                  setSelectedId(null);
                }}
                tabs={[
                  { value: 'receivable', label: 'مستحق لك' },
                  { value: 'payable', label: 'مستحق عليك' },
                ]}
              />
            }
          />
          <CardBody style={{ paddingInline: 0 }}>
            {view.list.length === 0 ? (
              <EmptyState
                title="لا توجد أرصدة مفتوحة"
                body="حين تُسجَّل فاتورة آجلة أو رصيد مورد، سيظهر الحساب هنا مع حالة استحقاقه."
              />
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  // The ledger can run to hundreds of accounts; scroll the list
                  // rather than letting it dictate the height of the page.
                  maxHeight: '62vh',
                  overflowY: 'auto',
                }}
              >
                {view.list.map((debtor) => (
                  <li key={debtor.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(debtor.id)}
                      aria-current={debtor.id === selected?.id}
                      className="hs-row"
                      style={{
                        width: '100%',
                        gap: 'var(--hs-sp-5)',
                        padding: 'var(--hs-sp-5) var(--hs-sp-9)',
                        border: 'none',
                        borderBlockEnd: '1px solid var(--hs-divider)',
                        background: debtor.id === selected?.id ? 'var(--hs-surface-alt)' : 'transparent',
                        cursor: 'pointer',
                        font: 'inherit',
                        textAlign: 'start',
                        minHeight: 'var(--hs-touch)',
                      }}
                    >
                      <InitialTile
                        name={debtor.name}
                        size={38}
                        bg="var(--hs-page)"
                        border="var(--hs-border)"
                        fg="var(--hs-text-slate-2)"
                      />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 'var(--hs-fs-body-lg)', fontWeight: 600 }}>
                          {debtor.name}
                        </span>
                        <span
                          className="hs-num"
                          style={{ display: 'block', fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-text-subtle)', marginBlockStart: 2 }}
                        >
                          {debtor.phone}
                          {debtor.lastPaymentAt ? ` · آخر سداد ${dateShort(debtor.lastPaymentAt)}` : ''}
                        </span>
                      </span>
                      <span
                        className="hs-num"
                        style={{ fontWeight: 600, color: STATUS_TINT[debtor.aging.status].amount, minWidth: 62, textAlign: 'end' }}
                      >
                        {money(debtor.outstanding, 0)}
                      </span>
                      <Badge
                        bg={STATUS_TINT[debtor.aging.status].bg}
                        fg={STATUS_TINT[debtor.aging.status].fg}
                      >
                        {DEBT_STATUS_LABEL[debtor.aging.status]}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {selected ? (
          <DebtorProfile
            debtor={selected}
            unit={unit}
            onRecordPayment={() => setPaying(selected)}
          />
        ) : null}
      </div>

      {paying ? (
        <PaymentDialog
          debtor={paying}
          onClose={() => setPaying(null)}
          onSubmit={(amount, method) => {
            customers!.recordPayment({ customerId: paying.id, amount, method });
            void db?.flush();
            setPaying(null);
          }}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------

function DebtorProfile({
  debtor,
  unit,
  onRecordPayment,
}: {
  debtor: DebtorSummary;
  unit: string;
  onRecordPayment: () => void;
}) {
  const { customers, profile, revision } = useHaseeb();
  const ledger = useMemo(
    () => customers?.ledgerFor(debtor.id) ?? [],
     
    [customers, debtor.id, revision],
  );

  const overdue = debtor.aging.status === 'overdue';
  const message = reminderMessage(debtor, profile?.name ?? 'حسيب', unit);

  return (
    <Card panel style={{ minWidth: 0 }}>
      <CardBody style={{ paddingBlockStart: 'var(--hs-sp-9)' }}>
        <div className="hs-row" style={{ gap: 'var(--hs-sp-6)' }}>
          <InitialTile
            name={debtor.name}
            size={52}
            bg="var(--hs-ink)"
            border="var(--hs-ink)"
            fg="var(--hs-on-dark)"
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 600 }}>{debtor.name}</div>
            <div style={{ fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-text-subtle)', marginBlockStart: 3 }}>
              {debtor.kind === 'supplier' ? 'مورد' : debtor.kind === 'wholesale' ? 'عميل جملة' : 'عميل تجزئة'}
              {debtor.sinceYear ? ` · منذ ${num(debtor.sinceYear).replace(/[,٬]/g, '')}` : ''}
            </div>
          </div>
        </div>

        <div
          style={{
            marginBlockStart: 'var(--hs-sp-9)',
            background: overdue ? 'var(--hs-danger-bg)' : 'var(--hs-surface-alt)',
            border: `1px solid ${overdue ? 'var(--hs-danger-border)' : 'var(--hs-border)'}`,
            borderRadius: 'var(--hs-r-tile)',
            padding: 'var(--hs-sp-8)',
          }}
        >
          <div style={{ fontSize: 'var(--hs-fs-label)', color: 'var(--hs-text-muted)' }}>الرصيد المستحق</div>
          <div
            className="hs-num"
            style={{ fontSize: 27, fontWeight: 600, color: overdue ? 'var(--hs-danger-text)' : 'var(--hs-ink)', marginBlockStart: 4 }}
          >
            {money(debtor.outstanding)} <span style={{ fontSize: 13 }}>{unit}</span>
          </div>
          <div style={{ fontSize: 'var(--hs-fs-badge)', color: overdue ? 'var(--hs-danger-text)' : 'var(--hs-text-muted)', marginBlockStart: 4 }}>
            {overdue
              ? `متأخر ${num(debtor.aging.daysOverdue)} يوماً عن تاريخ الاستحقاق`
              : debtor.aging.status === 'paid'
                ? 'لا يوجد رصيد مستحق'
                : `يستحق خلال ${num(Math.abs(debtor.aging.daysOverdue))} يوماً`}
          </div>
        </div>

        <h3 style={{ fontSize: 'var(--hs-fs-section-sm)', fontWeight: 600, margin: 'var(--hs-sp-10) 0 0' }}>
          سجل السدادات
        </h3>
        {ledger.length === 0 ? (
          <EmptyState title="لا توجد حركات" body="ستظهر هنا كل الديون والسدادات بترتيب زمني." />
        ) : (
          <Timeline
            label={`سجل حركات ${debtor.name}`}
            items={ledger.slice(0, 8).map((entry) => ({
              id: entry.id,
              dot: entry.kind === 'payment' ? 'var(--hs-emerald)' : 'var(--hs-danger-solid)',
              title: entry.label,
              meta: dateShort(entry.at),
              trailing: (
                <span
                  className="hs-num"
                  style={{
                    fontWeight: 600,
                    color: entry.kind === 'payment' ? 'var(--hs-mint-text)' : 'var(--hs-danger-text)',
                  }}
                >
                  {money(entry.amount, 0)}
                </span>
              ),
            }))}
          />
        )}

        <div className="hs-row" style={{ gap: 'var(--hs-sp-4)', marginBlockStart: 'var(--hs-sp-9)', flexWrap: 'wrap' }}>
          <Button
            variant="action"
            style={{ flex: 1, minWidth: 130 }}
            onClick={() => window.open(whatsappHref(debtor.phone, message), '_blank', 'noopener')}
            disabled={!debtor.phone}
          >
            تذكير واتساب
          </Button>
          <Button
            style={{ flex: 1, minWidth: 130 }}
            onClick={() => {
              window.location.href = smsHref(debtor.phone, message);
            }}
            disabled={!debtor.phone}
          >
            تذكير SMS
          </Button>
          <Button variant="primary" style={{ flex: 1, minWidth: 130 }} onClick={onRecordPayment}>
            تسجيل سداد
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function reminderMessage(debtor: DebtorSummary, business: string, unit: string): string {
  const amount = `${money(debtor.outstanding)} ${unit}`;
  if (debtor.aging.status === 'overdue') {
    return `أهلاً ${debtor.name}، تحية طيبة من ${business}.\nنود تذكيركم بأن الرصيد المستحق ${amount} متأخر ${num(debtor.aging.daysOverdue)} يوماً عن تاريخ الاستحقاق.\nنرجو التكرم بالسداد في أقرب فرصة. شكراً لتعاملكم معنا.`;
  }
  return `أهلاً ${debtor.name}، تحية طيبة من ${business}.\nنود تذكيركم بأن الرصيد المستحق ${amount} يقترب من تاريخ الاستحقاق.\nشكراً لتعاملكم معنا.`;
}

// ---------------------------------------------------------------------------

function PaymentDialog({
  debtor,
  onClose,
  onSubmit,
}: {
  debtor: DebtorSummary;
  onClose: () => void;
  onSubmit: (amountPiasters: number, method: 'cash' | 'wallet' | 'card' | 'transfer') => void;
}) {
  const [amount, setAmount] = useState((debtor.outstanding / 100).toFixed(2));
  const [method, setMethod] = useState<'cash' | 'wallet' | 'card' | 'transfer'>('cash');

  const piasters = Math.round(Number(amount) * 100);
  const invalid = !Number.isFinite(piasters) || piasters <= 0 || piasters > debtor.outstanding;

  return (
    <>
      <div className="hs-drawer__scrim" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`تسجيل سداد من ${debtor.name}`}
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
          تسجيل سداد — {debtor.name}
        </h2>
        <p style={{ margin: '5px 0 var(--hs-sp-9)', fontSize: 'var(--hs-fs-label)', color: 'var(--hs-text-muted)' }}>
          الرصيد المستحق <span className="hs-num">{money(debtor.outstanding)}</span>
        </p>

        <div className="hs-stack" style={{ gap: 'var(--hs-sp-7)' }}>
          <div>
            <label className="hs-field__label" htmlFor="pay-amount">
              المبلغ
            </label>
            <Input
              id="pay-amount"
              className="hs-input hs-num"
              type="number"
              min={0}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={invalid}
              autoFocus
            />
            {invalid ? (
              <span className="hs-field__error" role="alert">
                أدخل مبلغاً بين صفر والرصيد المستحق.
              </span>
            ) : null}
          </div>

          <div>
            <span className="hs-field__label">طريقة السداد</span>
            <div className="hs-row" style={{ gap: 'var(--hs-sp-3)', flexWrap: 'wrap' }}>
              {(
                [
                  ['cash', 'نقدي'],
                  ['wallet', 'محفظة'],
                  ['card', 'بطاقة'],
                  ['transfer', 'تحويل'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className="hs-chip"
                  aria-pressed={method === value}
                  onClick={() => setMethod(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="hs-row" style={{ gap: 'var(--hs-sp-4)' }}>
            <Button style={{ flex: 1 }} onClick={onClose}>
              إلغاء
            </Button>
            <Button
              variant="action"
              style={{ flex: 1 }}
              disabled={invalid}
              onClick={() => onSubmit(piasters, method)}
            >
              تسجيل السداد
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
