/**
 * E. الفواتير والأرباح — invoices and profitability.
 *
 * The period chips and status filters re-query the ledger rather than
 * filtering a cached array, so the four summary cards and the table always
 * describe the same set of rows.
 */

import { useState } from 'react';
import { useHaseeb } from '@/state/HaseebProvider';
import { useQuery } from '@/state/useQuery';
import { Badge, Button, Card, CardHead, ChipGroup, EmptyState, Input, Tabs } from '@/ui/primitives';
import { AccentCard, AutoGrid, DataTable, PageHeader, type Column } from '@/ui/composites';
import type { Invoice, InvoiceStatus, InvoiceWithLines } from '@/db/types';
import { NOUNS, counted, dateFull, money, percent } from '@/lib/format';
import { TaxInvoice } from '@/screens/parts/TaxInvoice';

type Period = 'today' | 'week' | 'month' | 'all';
type Kind = 'all' | 'retail' | 'wholesale';

const PERIODS: readonly { value: Period; label: string }[] = [
  { value: 'today', label: 'اليوم' },
  { value: 'week', label: 'هذا الأسبوع' },
  { value: 'month', label: 'هذا الشهر' },
  { value: 'all', label: 'الكل' },
];

const STATUS_TINT: Record<InvoiceStatus, { bg: string; fg: string; dot: string; label: string }> = {
  paid: { bg: 'var(--hs-mint-bg)', fg: 'var(--hs-mint-text)', dot: 'var(--hs-emerald)', label: 'مدفوعة' },
  pending: { bg: 'var(--hs-warn-bg)', fg: 'var(--hs-warn-text)', dot: 'var(--hs-warn-solid)', label: 'معلّقة' },
  overdue: { bg: 'var(--hs-danger-bg)', fg: 'var(--hs-danger-text)', dot: 'var(--hs-danger-solid)', label: 'متأخرة' },
};

export function Finance() {
  const { sales, analytics, accounting, profile, db } = useHaseeb();
  const [period, setPeriod] = useState<Period>('week');
  const [kind, setKind] = useState<Kind>('all');
  const [statuses, setStatuses] = useState<Set<InvoiceStatus>>(new Set());
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithLines | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

  const { data: view } = useQuery(async () => {
    if (!sales || !analytics || !accounting) return null;
    const { from, to } = rangeFor(period);
    const all = await sales.invoices({
      from: from.toISOString(),
      to: to.toISOString(),
      ...(kind === 'all' ? {} : { kind }),
    });
    return {
      summary: await analytics.financeSummary(from.toISOString(), to.toISOString()),
      rows: statuses.size === 0 ? all : all.filter((i) => statuses.has(i.status)),
      creditNotes: await accounting.creditNotes(),
    };
  }, [sales, analytics, accounting, period, kind, statuses]);

  if (!view) return null;
  const unit = profile?.currencyLabel ?? '₪';

  const toggleStatus = (status: InvoiceStatus): void => {
    setStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const columns: Column<Invoice>[] = [
    {
      key: 'no',
      header: 'رقم الفاتورة',
      width: '1.1fr',
      render: (i) => <span className="hs-num" style={{ fontWeight: 600 }}>{i.invoiceNo}</span>,
    },
    { key: 'client', header: 'العميل', width: '1.4fr', render: (i) => i.customerName },
    {
      key: 'date',
      header: 'التاريخ',
      width: '1fr',
      render: (i) => <span className="hs-num" style={{ color: 'var(--hs-text-muted)' }}>{dateFull(i.issuedAt)}</span>,
    },
    {
      key: 'amount',
      header: 'المبلغ',
      width: '1fr',
      render: (i) => <span className="hs-num" style={{ fontWeight: 600 }}>{money(i.total)}</span>,
    },
    {
      key: 'profit',
      header: 'الربح',
      width: '0.9fr',
      render: (i) => (
        <span className="hs-num" style={{ fontWeight: 600, color: 'var(--hs-emerald)' }}>
          {money(i.profit)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      width: '0.9fr',
      render: (i) => (
        <Badge bg={STATUS_TINT[i.status].bg} fg={STATUS_TINT[i.status].fg} dot={STATUS_TINT[i.status].dot}>
          {STATUS_TINT[i.status].label}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="الفواتير والأرباح"
        sub="تحليل الفواتير والهوامش حسب الفترة وقناة البيع"
        actions={
          <Button onClick={() => window.print()}>طباعة الجدول</Button>
        }
      />

      <Card style={{ padding: 'var(--hs-sp-6) var(--hs-sp-8)', borderRadius: 15, marginBlockEnd: 'var(--hs-sp-7)' }}>
        <div className="hs-row" style={{ gap: 'var(--hs-sp-8)', flexWrap: 'wrap' }}>
          <div className="hs-row" style={{ gap: 'var(--hs-sp-5)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--hs-fs-label)', fontWeight: 600, color: 'var(--hs-text-muted)' }}>
              الفترة
            </span>
            <ChipGroup label="الفترة" options={PERIODS} value={period} onChange={setPeriod} />
          </div>

          <span aria-hidden style={{ width: 1, alignSelf: 'stretch', background: 'var(--hs-border)' }} />

          <div className="hs-row" style={{ gap: 'var(--hs-sp-5)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--hs-fs-label)', fontWeight: 600, color: 'var(--hs-text-muted)' }}>
              الحالة
            </span>
            <div role="group" aria-label="الحالة" className="hs-row" style={{ gap: 'var(--hs-sp-3)', flexWrap: 'wrap' }}>
              {(Object.keys(STATUS_TINT) as InvoiceStatus[]).map((status) => {
                const tint = STATUS_TINT[status];
                const on = statuses.has(status);
                return (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleStatus(status)}
                    className="hs-badge-toggle"
                    style={{ background: tint.bg, color: tint.fg, borderColor: on ? tint.fg : 'transparent' }}
                  >
                    <span className="hs-badge__dot" style={{ background: tint.dot }} aria-hidden />
                    {tint.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <AutoGrid min={212} style={{ marginBlockEnd: 'var(--hs-sp-8)' }}>
        <AccentCard
          label="مبلغ الفواتير"
          value={money(view.summary.invoiced, 0)}
          note={`${counted(view.summary.invoiceCount, NOUNS.invoice)} في الفترة`}
          accent="var(--hs-ink)"
        />
        <AccentCard
          label="مبلغ البيع الإجمالي"
          value={money(view.summary.sales, 0)}
          note="بعد المرتجعات"
          accent="var(--hs-emerald)"
        />
        <AccentCard
          label="الأرباح الإجمالية"
          value={money(view.summary.grossProfit, 0)}
          note={`هامش ${percent(Math.round(view.summary.margin * 10) / 10, 1)}`}
          accent="var(--hs-mint)"
        />
        <AccentCard
          label="صافي الربح"
          value={money(view.summary.netProfit, 0)}
          note={`بعد ${money(view.summary.expenses, 0)} مصروفات`}
          accent="var(--hs-text-slate)"
        />
      </AutoGrid>

      <Card panel>
        <CardHead
          title="الفواتير"
          sub={`${counted(view.rows.length, NOUNS.invoice)} · بالـ${unit}`}
          actions={
            <Tabs
              label="قناة البيع"
              value={kind}
              onChange={setKind}
              tabs={[
                { value: 'all', label: 'كل الفواتير' },
                { value: 'retail', label: 'التجزئة' },
                { value: 'wholesale', label: 'الجملة' },
              ]}
            />
          }
        />
        <DataTable
          caption="جدول الفواتير"
          columns={columns}
          rows={view.rows}
          rowKey={(i) => i.id}
          onRowClick={(invoice) => {
            void sales?.invoiceById(invoice.id).then((full) => {
              if (full) setSelectedInvoice(full);
            });
          }}
          empty={
            <EmptyState
              title="لا توجد فواتير في هذه الفترة"
              body="غيّر الفترة أو أزل مرشّح الحالة لعرض فواتير أخرى."
              action={
                <Button
                  onClick={() => {
                    setPeriod('all');
                    setStatuses(new Set());
                  }}
                >
                  عرض كل الفترات
                </Button>
              }
            />
          }
        />
      </Card>

      <p style={{ fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-text-subtle)', marginBlockStart: 'var(--hs-sp-7)' }}>
        مصروفات الفترة {money(view.summary.expenses, 0)} {unit} — تُوزَّع مصروفات الشهر بالتناسب مع
        عدد أيام الفترة المختارة.
      </p>

      {selectedInvoice ? (
        <div className="hs-dialog-scrim hs-no-print" role="presentation" onMouseDown={() => setSelectedInvoice(null)}>
          <div
            className="hs-dialog hs-receipt-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`الفاتورة ${selectedInvoice.invoiceNo}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="hs-row" style={{ justifyContent: 'space-between', marginBlockEnd: 'var(--hs-sp-6)' }}>
              <strong>تفاصيل الفاتورة</strong>
              <Button size="sm" onClick={() => setSelectedInvoice(null)}>إغلاق</Button>
            </div>
            <TaxInvoice invoice={selectedInvoice} profile={profile} />
            {view.creditNotes.some((note) => note.invoiceId === selectedInvoice.id) ? (
              <div className="hs-badge" style={{ marginBlockStart: 'var(--hs-sp-6)', background: 'var(--hs-warn-bg)', color: 'var(--hs-warn-text)' }}>
                تم إصدار إشعار دائن وإرجاع هذه الفاتورة.
              </div>
            ) : (
              <div className="hs-return-box">
                <strong>إرجاع كامل للفاتورة</strong>
                <p>يعيد الأصناف للمخزن ويخصم العملية من المبيعات ويصدر قيداً عكسياً متوازناً.</p>
                <Input value={returnReason} onChange={(event) => setReturnReason(event.target.value)} placeholder="سبب المرتجع" />
                {returnError ? <p role="alert" style={{ color: 'var(--hs-danger-text)' }}>{returnError}</p> : null}
                <Button
                  variant="action"
                  disabled={returning || !returnReason.trim()}
                  onClick={async () => {
                    setReturning(true);
                    setReturnError(null);
                    try {
                      await accounting!.returnInvoice(selectedInvoice.id, returnReason);
                      await db?.flush();
                      setSelectedInvoice(null);
                      setReturnReason('');
                    } catch (cause) {
                      setReturnError(cause instanceof Error ? cause.message : 'تعذّر تسجيل المرتجع.');
                    } finally {
                      setReturning(false);
                    }
                  }}
                >
                  {returning ? 'جارٍ إصدار الإشعار…' : 'إصدار إشعار دائن وإرجاع الأصناف'}
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Resolve a period chip to a concrete window. */
function rangeFor(period: Period): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to.getTime());
  from.setHours(0, 0, 0, 0);
  switch (period) {
    case 'today':
      break;
    case 'week':
      from.setDate(from.getDate() - 6);
      break;
    case 'month':
      from.setDate(1);
      break;
    case 'all':
      from.setFullYear(from.getFullYear() - 20);
      break;
  }
  return { from, to };
}
