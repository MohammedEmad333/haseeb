/**
 * C. الإدارة العامة — financial health, operating costs, permissions and the
 * audit trail, plus the local-database controls (backup, sync queue, reset).
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHaseeb } from '@/state/HaseebProvider';
import { useQuery } from '@/state/useQuery';
import { Button, Card, CardBody, CardHead, EmptyState, Input, Meter } from '@/ui/primitives';
import { AutoGrid, DataTable, PageHeader, Timeline, type Column } from '@/ui/composites';
import { Can } from '@/shell/Guard';
import { StaffManager } from './manage/StaffManager';
import { DataTransfer } from './manage/DataTransfer';
import { NOUNS, counted, dateAndTime, money, num, percent } from '@/lib/format';
import type { JournalEntry, TrialBalanceRow } from '@/db/types';

export function Manage() {
  const { analytics, ops, accounting, profile, reset, storageLocation, syncPending, numbering, setNumbering, engine, db } =
    useHaseeb();
  const [confirmReset, setConfirmReset] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);
  const [shiftAction, setShiftAction] = useState<'open' | 'close' | null>(null);
  const navigate = useNavigate();

  const { data: view } = useQuery(async () => {
    if (!analytics || !ops || !accounting) return null;
    const expenses = await ops.expenses(new Date().toISOString().slice(0, 7));
    return {
      health: await analytics.financialHealth(),
      expenses,
      totalExpenses: expenses.reduce((t, e) => t + e.amount, 0),
      audit: await ops.audit(8),
      trialBalance: await accounting.trialBalance(),
      journals: await accounting.journals(8),
      shift: await accounting.currentShift(),
      shifts: await accounting.recentShifts(5),
    };
  }, [analytics, ops, accounting]);

  if (!view) return null;
  const unit = profile?.currencyLabel ?? '₪';

  return (
    <>
      <PageHeader
        title="الإدارة العامة"
        sub="الصحة المالية · التكاليف التشغيلية · الصلاحيات وسجل التدقيق"
        actions={<Button onClick={() => navigate('/onboarding')}>بيانات المنشأة</Button>}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))',
          gap: 'var(--hs-gap)',
          alignItems: 'start',
          marginBlockEnd: 'var(--hs-sp-8)',
        }}
      >
        <Card dark panel style={{ padding: 'var(--hs-sp-10)', minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 'var(--hs-fs-section)', fontWeight: 600, color: 'var(--hs-on-dark)' }}>
            الصحة المالية
          </h2>
          <div className="hs-row" style={{ gap: 'var(--hs-sp-6)', alignItems: 'baseline', marginBlockStart: 'var(--hs-sp-7)' }}>
            <span className="hs-num" style={{ fontSize: 52, fontWeight: 600, color: 'var(--hs-mint)', lineHeight: 1 }}>
              {num(view.health.score)}
            </span>
            <span style={{ fontSize: 'var(--hs-fs-body)', color: 'var(--hs-mint-border)' }}>
              من {num(100)} · {healthVerdict(view.health.score)}
            </span>
          </div>

          <div style={{ marginBlockStart: 'var(--hs-sp-11)', display: 'grid', gap: 'var(--hs-sp-8)' }}>
            {view.health.metrics.map((metric) => (
              <div key={metric.label}>
                <div className="hs-row" style={{ justifyContent: 'space-between', marginBlockEnd: 6 }}>
                  <span style={{ fontSize: 'var(--hs-fs-cell)', color: 'var(--hs-on-dark-muted)' }}>
                    {metric.label}
                  </span>
                  <span className="hs-num hs-signed" style={{ fontSize: 'var(--hs-fs-cell)', color: 'var(--hs-on-dark)', fontWeight: 600 }}>
                    {metric.unit === 'percent' ? percent(metric.value, 1) : `${num(metric.value, 1)}×`}
                  </span>
                </div>
                <Meter value={metric.fill} color={metric.color} height={5} onDark label={metric.label} />
              </div>
            ))}
          </div>
        </Card>

        <Card panel style={{ minWidth: 0 }}>
          <CardHead
            title="التكاليف التشغيلية"
            sub="مصروفات الشهر الحالي"
            actions={<Button size="sm" variant="action" onClick={() => setAddingExpense(true)}>+ تسجيل مصروف</Button>}
          />
          <CardBody>
            {view.expenses.length === 0 ? (
              <EmptyState title="لا توجد مصروفات مسجّلة" body="سجّل مصروفات الشهر لتظهر حصّة كل بند من الإجمالي." />
            ) : (
              <>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {view.expenses.map((expense) => (
                    <li
                      key={expense.id}
                      className="hs-row"
                      style={{ gap: 'var(--hs-sp-5)', paddingBlock: 'var(--hs-sp-5)', borderBlockEnd: '1px solid var(--hs-divider)' }}
                    >
                      <span aria-hidden style={{ width: 9, height: 9, borderRadius: 3, background: expense.color, flex: 'none' }} />
                      <span style={{ flex: 1, fontSize: 'var(--hs-fs-cell)' }}>{expense.label}</span>
                      <span className="hs-num" style={{ fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-text-subtle)' }}>
                        {percent(Math.round((expense.amount / view.totalExpenses) * 100))}
                      </span>
                      <span className="hs-num" style={{ fontSize: 'var(--hs-fs-cell)', fontWeight: 600, minWidth: 62, textAlign: 'end' }}>
                        {money(expense.amount, 0)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div
                  className="hs-row"
                  style={{
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBlockStart: 'var(--hs-sp-8)',
                    paddingBlockStart: 'var(--hs-sp-8)',
                    borderBlockStart: '1px dashed var(--hs-border)',
                  }}
                >
                  <span style={{ fontSize: 'var(--hs-fs-cell)', color: 'var(--hs-text-muted)' }}>
                    إجمالي المصروفات
                  </span>
                  <span className="hs-num" style={{ fontSize: 20, fontWeight: 600 }}>
                    {money(view.totalExpenses, 0)} <span style={{ fontSize: 12 }}>{unit}</span>
                  </span>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <AutoGrid min={420} style={{ alignItems: 'start', marginBlockEnd: 'var(--hs-sp-8)' }}>
        <LedgerPanel rows={view.trialBalance} journals={view.journals} unit={unit} />
        <Card panel style={{ minWidth: 0 }}>
          <CardHead
            title="وردية الصندوق"
            sub={view.shift ? `مفتوحة بواسطة ${view.shift.openedBy} · ${dateAndTime(view.shift.openedAt)}` : 'لا توجد وردية مفتوحة'}
            actions={
              <Button variant="action" size="sm" onClick={() => setShiftAction(view.shift ? 'close' : 'open')}>
                {view.shift ? 'إغلاق ومطابقة' : 'فتح وردية'}
              </Button>
            }
          />
          <CardBody>
            {view.shift ? (
              <div className="hs-shift-current">
                <span>الرصيد الافتتاحي</span>
                <strong className="hs-num">{money(view.shift.openingCash)} {unit}</strong>
              </div>
            ) : null}
            {view.shifts.filter((shift) => shift.status === 'closed').length ? (
              <ul className="hs-shift-list">
                {view.shifts.filter((shift) => shift.status === 'closed').map((shift) => (
                  <li key={shift.id}>
                    <span>{dateAndTime(shift.closedAt!)}</span>
                    <span className="hs-num">متوقع {money(shift.expectedCash ?? 0)}</span>
                    <strong className="hs-num" style={{ color: shift.difference === 0 ? 'var(--hs-emerald)' : 'var(--hs-danger-text)' }}>
                      الفرق {money(shift.difference ?? 0)}
                    </strong>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="لا توجد ورديات مغلقة" body="افتح وردية لتبدأ مطابقة الصندوق مع المبيعات النقدية." />}
          </CardBody>
        </Card>
      </AutoGrid>

      <AutoGrid min={340} style={{ alignItems: 'start', marginBlockEnd: 'var(--hs-sp-8)' }}>
        <Can ability="staff.manage">
          <StaffManager />
        </Can>

        <Card panel style={{ minWidth: 0 }}>
          <CardHead title="سجل التدقيق" sub="كل عملية تُسجَّل محلياً بختم زمني غير قابل للتعديل" />
          <CardBody>
            <Timeline
              label="سجل التدقيق"
              items={view.audit.map((entry) => ({
                id: entry.id,
                dot: 'var(--hs-text-subtle)',
                title: entry.description,
                meta: `${entry.actor} · ${dateAndTime(entry.occurredAt)}`,
              }))}
            />
          </CardBody>
        </Card>
      </AutoGrid>

      <Card panel style={{ marginBlockEnd: 'var(--hs-sp-8)' }}>
        <CardHead title="العرض" sub="يُحفظ على هذا الجهاز" />
        <CardBody>
          <div className="hs-row" style={{ justifyContent: 'space-between', gap: 'var(--hs-sp-8)', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 'var(--hs-fs-cell)', fontWeight: 600 }}>شكل الأرقام</div>
              <div style={{ fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-text-muted)', marginBlockStart: 3 }}>
                يسري على كل الشاشات والفواتير والتقارير المصدّرة.
              </div>
            </div>
            <div role="group" aria-label="شكل الأرقام" className="hs-row" style={{ gap: 'var(--hs-sp-3)' }}>
              <button
                type="button"
                className="hs-chip"
                aria-pressed={numbering === 'latn'}
                onClick={() => void setNumbering('latn')}
              >
                إنجليزية · 1234
              </button>
              <button
                type="button"
                className="hs-chip"
                aria-pressed={numbering === 'arab'}
                onClick={() => void setNumbering('arab')}
              >
                عربية · ١٢٣٤
              </button>
            </div>
          </div>
        </CardBody>
      </Card>

      <Can ability="data.export">
        <div style={{ marginBlockEnd: 'var(--hs-sp-8)' }}>
          <DataTransfer />
        </div>
      </Can>

      <Card panel>
        <CardHead title="قاعدة البيانات المحلية" sub={`${storageLocation} · محرّك ${engine}`} />
        <CardBody>
          <p style={{ margin: 0, fontSize: 'var(--hs-fs-body)', color: 'var(--hs-text-muted)', lineHeight: 1.8 }}>
            البيانات محفوظة على هذا الجهاز ومشفّرة بمعيار AES-256-GCM، ولا تغادره إلا بملف
            تصدّره بنفسك. العمليات تُدرَج في طابور محلي —
            {' '}
            {counted(syncPending, NOUNS.operation)} في الطابور الآن.
          </p>

          <Can ability="data.reset">
            <div className="hs-row" style={{ gap: 'var(--hs-sp-4)', marginBlockStart: 'var(--hs-sp-8)', flexWrap: 'wrap' }}>
              {confirmReset ? (
                <>
                  <Button
                    variant="action"
                    onClick={async () => {
                      await reset();
                      setConfirmReset(false);
                    }}
                  >
                    تأكيد إعادة الضبط
                  </Button>
                  <Button onClick={() => setConfirmReset(false)}>تراجع</Button>
                  <span className="hs-field__error" role="alert">
                    ستُحذف كل البيانات المسجّلة ويعود التطبيق إلى نقطة البداية.
                  </span>
                </>
              ) : (
                <Button onClick={() => setConfirmReset(true)}>إعادة ضبط قاعدة البيانات</Button>
              )}
            </div>
          </Can>
        </CardBody>
      </Card>

      {addingExpense ? (
        <ExpenseDialog
          unit={unit}
          onClose={() => setAddingExpense(false)}
          onSubmit={async (input) => {
            await ops!.addExpense(input);
            setAddingExpense(false);
          }}
        />
      ) : null}

      {shiftAction ? (
        <CashShiftDialog
          mode={shiftAction}
          unit={unit}
          onClose={() => setShiftAction(null)}
          onSubmit={async (amount) => {
            if (shiftAction === 'open') await accounting!.openShift(amount);
            else await accounting!.closeShift(amount);
            await db?.flush();
            setShiftAction(null);
          }}
        />
      ) : null}
    </>
  );
}

function LedgerPanel({ rows, journals, unit }: { rows: TrialBalanceRow[]; journals: JournalEntry[]; unit: string }) {
  const debit = rows.reduce((sum, row) => sum + row.debit, 0);
  const credit = rows.reduce((sum, row) => sum + row.credit, 0);
  const columns: Column<TrialBalanceRow>[] = [
    { key: 'account', header: 'الحساب', width: '1.6fr', render: (row) => <><span className="hs-num">{row.code}</span> · {row.name}</> },
    { key: 'debit', header: 'مدين', width: '.8fr', render: (row) => <span className="hs-num">{money(row.debit)}</span> },
    { key: 'credit', header: 'دائن', width: '.8fr', render: (row) => <span className="hs-num">{money(row.credit)}</span> },
  ];
  return (
    <Card panel style={{ minWidth: 0 }}>
      <CardHead title="ميزان المراجعة" sub={`قيود مزدوجة · بالـ${unit}`} actions={<span className="hs-badge" style={{ background: debit === credit ? 'var(--hs-mint-bg)' : 'var(--hs-danger-bg)', color: debit === credit ? 'var(--hs-mint-text)' : 'var(--hs-danger-text)' }}>{debit === credit ? 'متوازن' : 'غير متوازن'}</span>} />
      <DataTable caption="ميزان المراجعة" compact columns={columns} rows={rows.filter((row) => row.debit || row.credit)} rowKey={(row) => row.id} />
      <CardBody>
        <div className="hs-row" style={{ justifyContent: 'space-between', fontWeight: 700 }}>
          <span>الإجمالي المدين: <span className="hs-num">{money(debit)}</span></span>
          <span>الإجمالي الدائن: <span className="hs-num">{money(credit)}</span></span>
        </div>
        <h3 style={{ marginBlock: 'var(--hs-sp-8) var(--hs-sp-4)' }}>آخر القيود</h3>
        <Timeline label="آخر القيود المحاسبية" items={journals.map((entry) => ({ id: entry.id, dot: entry.debit === entry.credit ? 'var(--hs-emerald)' : 'var(--hs-danger-solid)', title: entry.description, meta: `${dateAndTime(entry.occurredAt)} · ${money(entry.debit)}` }))} />
      </CardBody>
    </Card>
  );
}

function CashShiftDialog({ mode, unit, onClose, onSubmit }: { mode: 'open' | 'close'; unit: string; onClose: () => void; onSubmit: (amount: number) => Promise<void> }) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <div className="hs-dialog-scrim" role="presentation" onMouseDown={onClose}>
      <form className="hs-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()} onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true); setError(null);
        try { await onSubmit(Math.round(Number(amount) * 100)); }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذّر حفظ الوردية.'); }
        finally { setSaving(false); }
      }}>
        <CardHead title={mode === 'open' ? 'فتح وردية الصندوق' : 'إغلاق ومطابقة الصندوق'} sub={mode === 'open' ? 'أدخل النقد الموجود في الدرج عند البداية.' : 'عدّ النقد الفعلي في الدرج وأدخله للمقارنة.'} actions={<Button size="sm" onClick={onClose}>إغلاق</Button>} />
        <label className="hs-field__label" htmlFor="shift-amount">{mode === 'open' ? 'الرصيد الافتتاحي' : 'الرصيد الفعلي'} ({unit})</label>
        <Input id="shift-amount" autoFocus required type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
        {error ? <p role="alert" style={{ color: 'var(--hs-danger-text)' }}>{error}</p> : null}
        <Button block variant="action" type="submit" disabled={saving || !amount}>{saving ? 'جارٍ الحفظ…' : mode === 'open' ? 'فتح الوردية' : 'إغلاق ومطابقة'}</Button>
      </form>
    </div>
  );
}

function ExpenseDialog({
  unit,
  onClose,
  onSubmit,
}: {
  unit: string;
  onClose: () => void;
  onSubmit: (input: { label: string; amount: number; period: string }) => void | Promise<void>;
}) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const parsed = Number(amount);
  const piasters = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
  const invalid = !label.trim() || piasters <= 0 || !/^\d{4}-\d{2}$/.test(period);

  const save = async (): Promise<void> => {
    if (invalid) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ label: label.trim(), amount: piasters, period });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تسجيل المصروف.');
      setSaving(false);
    }
  };

  return (
    <>
      <div className="hs-drawer__scrim" onClick={saving ? undefined : onClose} />
      <div role="dialog" aria-modal="true" aria-label="تسجيل مصروف" style={dialogStyle}>
        <h2 style={{ margin: 0, fontSize: 'var(--hs-fs-section)' }}>تسجيل مصروف</h2>
        <div className="hs-stack" style={{ gap: 'var(--hs-sp-7)', marginBlockStart: 'var(--hs-sp-8)' }}>
          <div>
            <label className="hs-field__label" htmlFor="expense-label">اسم المصروف</label>
            <Input id="expense-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثال: إيجار، كهرباء، نقل" autoFocus />
          </div>
          <div>
            <label className="hs-field__label" htmlFor="expense-amount">القيمة ({unit})</label>
            <Input id="expense-amount" className="hs-input hs-num" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="hs-field__label" htmlFor="expense-period">الشهر</label>
            <Input id="expense-period" className="hs-input hs-num" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          {error ? <span className="hs-field__error" role="alert">{error}</span> : null}
          <div className="hs-row" style={{ gap: 'var(--hs-sp-4)' }}>
            <Button style={{ flex: 1 }} disabled={saving} onClick={onClose}>إلغاء</Button>
            <Button variant="action" style={{ flex: 1 }} disabled={invalid || saving} onClick={() => void save()}>
              {saving ? 'جارٍ الحفظ…' : 'حفظ المصروف'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

const dialogStyle = {
  position: 'fixed',
  insetBlockStart: '50%',
  insetInlineStart: '50%',
  transform: 'translate(50%, -50%)',
  zIndex: 62,
  width: 'min(440px, 92vw)',
  background: 'var(--hs-surface)',
  borderRadius: 'var(--hs-r-panel)',
  padding: 'var(--hs-sp-10)',
  boxShadow: 'var(--hs-shadow-modal)',
} as const;

function healthVerdict(score: number): string {
  if (score >= 75) return 'وضع مستقر';
  if (score >= 50) return 'وضع مقبول';
  if (score >= 30) return 'يحتاج متابعة';
  return 'وضع حرج';
}
