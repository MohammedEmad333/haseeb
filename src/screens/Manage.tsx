/**
 * C. الإدارة العامة — financial health, operating costs, permissions and the
 * audit trail, plus the local-database controls (backup, sync queue, reset).
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHaseeb } from '@/state/HaseebProvider';
import { useQuery } from '@/state/useQuery';
import { Button, Card, CardBody, CardHead, EmptyState, Meter } from '@/ui/primitives';
import { AutoGrid, PageHeader, Timeline } from '@/ui/composites';
import { Can } from '@/shell/Guard';
import { StaffManager } from './manage/StaffManager';
import { DataTransfer } from './manage/DataTransfer';
import { NOUNS, counted, dateAndTime, money, num, percent } from '@/lib/format';

export function Manage() {
  const { analytics, ops, profile, reset, storageLocation, syncPending, numbering, setNumbering, engine } =
    useHaseeb();
  const [confirmReset, setConfirmReset] = useState(false);
  const navigate = useNavigate();

  const { data: view } = useQuery(async () => {
    if (!analytics || !ops) return null;
    const expenses = await ops.expenses();
    return {
      health: await analytics.financialHealth(),
      expenses,
      totalExpenses: expenses.reduce((t, e) => t + e.amount, 0),
      audit: await ops.audit(8),
    };
  }, [analytics, ops]);

  if (!view) return null;
  const unit = profile?.currencyLabel ?? 'ج.م';

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
          <CardHead title="التكاليف التشغيلية" sub="مصروفات الشهر الحالي" />
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
                    ستُحذف كل الحركات المسجّلة وتُستبدل بالبيانات الافتتاحية.
                  </span>
                </>
              ) : (
                <Button onClick={() => setConfirmReset(true)}>إعادة الضبط للبيانات الافتتاحية</Button>
              )}
            </div>
          </Can>
        </CardBody>
      </Card>
    </>
  );
}

function healthVerdict(score: number): string {
  if (score >= 75) return 'وضع مستقر';
  if (score >= 50) return 'وضع مقبول';
  if (score >= 30) return 'يحتاج متابعة';
  return 'وضع حرج';
}
