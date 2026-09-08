/**
 * B. لوحة التحكم الرئيسية — the executive dashboard.
 *
 * Six KPI tiles, a seven-day sales-versus-profit chart, the channel donut and
 * the three quick actions. Every figure is derived from the local ledger, so
 * the dashboard cannot drift from the books it summarises.
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHaseeb } from '@/state/HaseebProvider';
import { Button, Card, CardBody, CardHead } from '@/ui/primitives';
import { AutoGrid, KpiTile, PageHeader } from '@/ui/composites';
import { SalesProfitChart } from '@/screens/parts/SalesProfitChart';
import { ChannelDonut } from '@/screens/parts/ChannelDonut';
import { dateLong, moneyRounded, signedPercent } from '@/lib/format';
import { exportReportCsv } from '@/lib/report';

export function Dashboard() {
  const { analytics, profile, revision, ops, sales } = useHaseeb();
  const navigate = useNavigate();

  const view = useMemo(() => {
    if (!analytics) return null;
    const asOf = new Date();
    return {
      kpis: analytics.kpis(asOf),
      series: analytics.weekSeries(asOf),
      channels: analytics.channelShares(asOf),
      weekSales: analytics.weekTotals(asOf).sales,
    };
    // `revision` is the database's change signal.
     
  }, [analytics, revision]);

  if (!view) return null;

  const unit = profile?.currencyLabel ?? 'ج.م';

  return (
    <>
      <PageHeader
        title="لوحة التحكم الرئيسية"
        sub={`ملخّص الأداء المالي · الأسبوع الحالي حتى ${dateLong(new Date().toISOString())}`}
        actions={
          <>
            <Button onClick={() => exportReportCsv(sales!, ops!, analytics!)}>تصدير التقرير</Button>
            <Button variant="primary" onClick={() => navigate('/pos')}>
              + بيع جديد
            </Button>
          </>
        }
      />

      <AutoGrid min={196} style={{ marginBlockEnd: 'var(--hs-sp-8)' }}>
        {view.kpis.map((kpi) => (
          <KpiTile
            key={kpi.key}
            label={kpi.label}
            value={moneyRounded(kpi.value)}
            unit={unit}
            delta={signedPercent(Math.round(kpi.delta))}
            deltaTone={kpi.delta < 0 ? 'down' : 'up'}
            progress={kpi.progress}
            progressColor={kpi.color}
          />
        ))}
      </AutoGrid>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))',
          gap: 'var(--hs-gap)',
          marginBlockEnd: 'var(--hs-sp-8)',
        }}
      >
        <Card panel style={{ gridColumn: 'span 1', minWidth: 0 }}>
          <CardHead title="المبيعات مقابل الأرباح" sub="آخر ٧ أيام · بالجنيه" actions={<ChartLegend />} />
          <CardBody style={{ paddingInline: 'var(--hs-sp-9)' }}>
            <SalesProfitChart points={view.series} />
          </CardBody>
        </Card>

        <Card panel style={{ minWidth: 0 }}>
          <CardHead title="توزيع المبيعات" sub="حسب قناة البيع" />
          <CardBody>
            <ChannelDonut segments={view.channels} total={view.weekSales} />
          </CardBody>
        </Card>
      </div>

      <AutoGrid min={228}>
        <QuickAction
          dark
          title="بيع جديد"
          desc="فتح شاشة الكاشير"
          glyph="₪"
          iconBg="rgba(16,185,129,.18)"
          iconFg="var(--hs-mint)"
          onClick={() => navigate('/pos')}
        />
        <QuickAction
          title="تسجيل دين"
          desc="إضافة مبلغ على عميل"
          glyph="د"
          iconBg="var(--hs-danger-bg)"
          iconFg="var(--hs-danger-text)"
          onClick={() => navigate('/debts')}
        />
        <QuickAction
          title="إصدار فاتورة"
          desc="فاتورة ضريبية مع QR"
          glyph="ف"
          iconBg="var(--hs-mint-bg)"
          iconFg="var(--hs-mint-text)"
          onClick={() => navigate('/orders')}
        />
      </AutoGrid>
    </>
  );
}

function ChartLegend() {
  return (
    <div className="hs-row" style={{ gap: 'var(--hs-sp-7)' }}>
      {[
        { label: 'المبيعات', color: 'var(--hs-emerald)' },
        { label: 'الربح', color: 'var(--hs-ink)' },
      ].map((item) => (
        <span key={item.label} className="hs-row" style={{ gap: 6, fontSize: 'var(--hs-fs-meta)', color: 'var(--hs-text-muted)' }}>
          <span aria-hidden style={{ width: 10, height: 3, borderRadius: 2, background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function QuickAction({
  title,
  desc,
  glyph,
  iconBg,
  iconFg,
  dark,
  onClick,
}: {
  title: string;
  desc: string;
  glyph: string;
  iconBg: string;
  iconFg: string;
  dark?: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      dark={dark}
      lift
      style={{
        padding: 17,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--hs-sp-6)',
        textAlign: 'start',
        cursor: 'pointer',
        font: 'inherit',
        width: '100%',
      }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <span
        aria-hidden
        style={{
          width: 42,
          height: 42,
          flex: 'none',
          display: 'grid',
          placeItems: 'center',
          borderRadius: 13,
          background: iconBg,
          color: iconFg,
          fontSize: 18,
          fontWeight: 600,
        }}
      >
        {glyph}
      </span>
      <span>
        <span
          style={{
            display: 'block',
            fontSize: 'var(--hs-fs-section-sm)',
            fontWeight: 600,
            color: dark ? 'var(--hs-on-dark)' : 'var(--hs-ink)',
          }}
        >
          {title}
        </span>
        <span
          style={{
            display: 'block',
            fontSize: 'var(--hs-fs-meta)',
            color: dark ? 'var(--hs-on-dark-subtle)' : 'var(--hs-text-muted)',
            marginBlockStart: 3,
          }}
        >
          {desc}
        </span>
      </span>
    </Card>
  );
}
