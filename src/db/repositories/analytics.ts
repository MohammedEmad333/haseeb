import { HaseebDatabase } from '../database';
import { marginPercent } from '@/domain/inventory';
import { CustomerRepository } from './customers';
import { OperationsRepository } from './operations';

/**
 * Read-only rollups for لوحة التحكم and الفواتير والأرباح.
 *
 * Every figure the dashboard shows is derived here from the same rows the
 * other screens read, so a KPI can never quietly diverge from the ledger it
 * claims to summarise.
 */

export interface Kpi {
  key: string;
  label: string;
  /** Piasters. */
  value: number;
  /** Percentage change against the previous comparable period. */
  delta: number;
  /** 0–1 progress fill. */
  progress: number;
  color: string;
}

export interface SeriesPoint {
  label: string;
  sales: number;
  profit: number;
}

export interface ChannelShare {
  label: string;
  channel: string;
  share: number;
  color: string;
}

const DAY_LABELS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export class AnalyticsRepository {
  #customers: CustomerRepository;
  #ops: OperationsRepository;

  constructor(private readonly db: HaseebDatabase) {
    this.#customers = new CustomerRepository(db);
    this.#ops = new OperationsRepository(db);
  }

  /** Sales and profit between two instants. */
  async totalsBetween(
    fromIso: string,
    toIso: string,
  ): Promise<{ sales: number; profit: number; count: number }> {
    const row = await this.db.get(
      `SELECT COALESCE(SUM(total_piasters), 0) AS sales,
              COALESCE(SUM(profit_piasters), 0) AS profit,
              COUNT(*) AS n
       FROM sales WHERE occurred_at >= ? AND occurred_at < ?`,
      [fromIso, toIso],
    );
    const returned = await this.db.get(
      `SELECT COALESCE(SUM(total_piasters), 0) AS sales,
              COALESCE(SUM(profit_piasters), 0) AS profit
       FROM credit_notes WHERE issued_at >= ? AND issued_at < ?`,
      [fromIso, toIso],
    );
    return {
      sales: Number(row?.sales ?? 0) - Number(returned?.sales ?? 0),
      profit: Number(row?.profit ?? 0) - Number(returned?.profit ?? 0),
      count: Number(row?.n ?? 0),
    };
  }

  async todayTotals(asOf = new Date()): Promise<{ sales: number; profit: number; count: number }> {
    const start = startOfDay(asOf);
    return this.totalsBetween(start.toISOString(), addDays(start, 1).toISOString());
  }

  async weekTotals(asOf = new Date()): Promise<{ sales: number; profit: number; count: number }> {
    const start = addDays(startOfDay(asOf), -6);
    return this.totalsBetween(start.toISOString(), addDays(startOfDay(asOf), 1).toISOString());
  }

  /** Seven-day sales/profit series for the dashboard chart, oldest first. */
  async weekSeries(asOf = new Date()): Promise<SeriesPoint[]> {
    const points: SeriesPoint[] = [];
    const today = startOfDay(asOf);
    for (let i = 6; i >= 0; i -= 1) {
      const from = addDays(today, -i);
      const to = addDays(from, 1);
      const { sales, profit } = await this.totalsBetween(from.toISOString(), to.toISOString());
      points.push({ label: DAY_LABELS[from.getDay()], sales, profit });
    }
    return points;
  }

  /** Share of the week's revenue by sales channel, for the donut. */
  async channelShares(asOf = new Date()): Promise<ChannelShare[]> {
    const start = addDays(startOfDay(asOf), -6).toISOString();
    const end = addDays(startOfDay(asOf), 1).toISOString();
    const rows = await this.db.all(
      `SELECT channel, SUM(amount) AS total FROM (
         SELECT channel, total_piasters AS amount FROM sales
          WHERE occurred_at >= ? AND occurred_at < ?
         UNION ALL
         SELECT s.channel, -c.total_piasters AS amount FROM credit_notes c
          JOIN invoices i ON i.id = c.invoice_id JOIN sales s ON s.id = i.sale_id
          WHERE c.issued_at >= ? AND c.issued_at < ?
       ) GROUP BY channel`,
      [start, end, start, end],
    );
    const total = rows.reduce((t, r) => t + Number(r.total), 0);
    const meta: Record<string, { label: string; color: string }> = {
      retail: { label: 'تجزئة بالمحل', color: '#0F172A' },
      wholesale: { label: 'جملة', color: '#059669' },
      preorder: { label: 'طلبات مسبقة', color: '#10B981' },
      other: { label: 'أخرى', color: '#CBD5E1' },
    };
    return (['retail', 'wholesale', 'preorder', 'other'] as const).map((channel) => {
      const found = rows.find((r) => String(r.channel) === channel);
      const amount = Number(found?.total ?? 0);
      return {
        channel,
        label: meta[channel].label,
        color: meta[channel].color,
        share: total === 0 ? 0 : (amount / total) * 100,
      };
    });
  }

  /**
   * Cash actually taken in over a window: sales settled on the spot plus
   * payments received against older debts. Credit sales are revenue but not
   * yet «محصول», which is the distinction the owner cares about.
   */
  async collectedBetween(fromIso: string, toIso: string): Promise<number> {
    const settled = Number(
      (await this.db.value(
        `SELECT COALESCE(SUM(total_piasters), 0) FROM sales
         WHERE payment_method <> 'credit' AND occurred_at >= ? AND occurred_at < ?`,
        [fromIso, toIso],
      )) ?? 0,
    );
    const collected = Number(
      (await this.db.value(
        'SELECT COALESCE(SUM(amount_piasters), 0) FROM payments WHERE paid_at >= ? AND paid_at < ?',
        [fromIso, toIso],
      )) ?? 0,
    );
    const refunded = Number(
      (await this.db.value(
        `SELECT COALESCE(SUM(total_piasters), 0) FROM credit_notes
         WHERE payment_method <> 'credit' AND issued_at >= ? AND issued_at < ?`,
        [fromIso, toIso],
      )) ?? 0,
    );
    return settled + collected - refunded;
  }

  /** The six dashboard KPI tiles. */
  async kpis(asOf = new Date()): Promise<Kpi[]> {
    const today = await this.todayTotals(asOf);
    const week = await this.weekTotals(asOf);

    const prevDayStart = addDays(startOfDay(asOf), -1);
    const prevDay = await this.totalsBetween(
      prevDayStart.toISOString(),
      startOfDay(asOf).toISOString(),
    );
    const prevWeekStart = addDays(startOfDay(asOf), -13);
    const prevWeek = await this.totalsBetween(
      prevWeekStart.toISOString(),
      addDays(startOfDay(asOf), -6).toISOString(),
    );

    const weekStart = addDays(startOfDay(asOf), -6);
    const weekEnd = addDays(startOfDay(asOf), 1);
    const collectedThisWeek = await this.collectedBetween(
      weekStart.toISOString(),
      weekEnd.toISOString(),
    );
    const collectedPrevWeek = await this.collectedBetween(
      prevWeekStart.toISOString(),
      weekStart.toISOString(),
    );

    // Costs pro-rated to the same seven days the profit was earned in.
    const expenses = await this.#ops.expensesForRange(
      weekStart.toISOString(),
      weekEnd.toISOString(),
    );
    const netProfit = week.profit - expenses;
    const debt = await this.#customers.debtTotals(asOf);
    const debtLastWeek = await this.outstandingAsOf(weekStart);

    return [
      {
        key: 'sales',
        label: 'إجمالي المبيعات',
        value: week.sales,
        delta: growth(week.sales, prevWeek.sales),
        progress: 0.82,
        color: '#059669',
      },
      {
        key: 'today',
        label: 'دخل اليوم',
        value: today.sales,
        delta: growth(today.sales, prevDay.sales),
        progress: 0.58,
        color: '#10B981',
      },
      {
        key: 'week',
        label: 'محصول الأسبوع',
        value: collectedThisWeek,
        delta: growth(collectedThisWeek, collectedPrevWeek),
        progress: 0.71,
        color: '#059669',
      },
      {
        key: 'gross',
        label: 'الأرباح الإجمالية',
        value: week.profit,
        delta: growth(week.profit, prevWeek.profit),
        progress: 0.64,
        color: '#0F172A',
      },
      {
        key: 'net',
        label: 'صافي الربح',
        value: netProfit,
        delta: growth(netProfit, prevWeek.profit - expenses),
        progress: 0.46,
        color: '#0F172A',
      },
      {
        key: 'debt',
        label: 'إجمالي الديون',
        value: debt.receivable,
        delta: growth(debt.receivable, debtLastWeek),
        progress: 0.34,
        color: '#DC2626',
      },
    ];
  }

  /**
   * Total receivables outstanding at a past instant — debts raised by then,
   * less payments received by then. Used for the week-on-week debt delta.
   */
  async outstandingAsOf(when: Date): Promise<number> {
    const iso = when.toISOString();
    const raised = Number(
      (await this.db.value(
        `SELECT COALESCE(SUM(principal_piasters), 0) FROM debts
         WHERE direction = 'receivable' AND opened_at <= ?`,
        [iso],
      )) ?? 0,
    );
    const settled = Number(
      (await this.db.value(
        'SELECT COALESCE(SUM(amount_piasters), 0) FROM payments WHERE paid_at <= ?',
        [iso],
      )) ?? 0,
    );
    return Math.max(0, raised - settled);
  }

  /** The four cards on الفواتير والأرباح for a date window. */
  async financeSummary(
    fromIso: string,
    toIso: string,
  ): Promise<{
    invoiced: number;
    invoiceCount: number;
    sales: number;
    grossProfit: number;
    expenses: number;
    netProfit: number;
    margin: number;
  }> {
    const invoiceRow = await this.db.get(
      `SELECT COALESCE(SUM(total_piasters), 0) AS total, COUNT(*) AS n
       FROM invoices WHERE issued_at >= ? AND issued_at <= ?`,
      [fromIso, toIso],
    );
    const returned = Number(
      (await this.db.value(
        'SELECT COALESCE(SUM(total_piasters), 0) FROM credit_notes WHERE issued_at >= ? AND issued_at <= ?',
        [fromIso, toIso],
      )) ?? 0,
    );
    const { sales, profit } = await this.totalsBetween(fromIso, toIso);
    const expenses = await this.#ops.expensesForRange(fromIso, toIso);
    return {
      invoiced: Number(invoiceRow?.total ?? 0) - returned,
      invoiceCount: Number(invoiceRow?.n ?? 0),
      sales,
      grossProfit: profit,
      expenses,
      netProfit: profit - expenses,
      margin: marginPercent(sales, profit),
    };
  }

  /** The financial-health score and its four meters (الإدارة العامة). */
  async financialHealth(asOf = new Date()): Promise<{
    score: number;
    /**
     * Raw values with the unit they are measured in. Formatting stays in the
     * UI layer — a repository that returns pre-rendered digits cannot honour
     * the numbering-system setting.
     */
    metrics: Array<{
      label: string;
      value: number;
      unit: 'percent' | 'times';
      fill: number;
      color: string;
    }>;
  }> {
    const week = await this.weekTotals(asOf);
    const debt = await this.#customers.debtTotals(asOf);
    const expenses = await this.#ops.expensesForRange(
      addDays(startOfDay(asOf), -6).toISOString(),
      addDays(startOfDay(asOf), 1).toISOString(),
    );

    const margin = marginPercent(week.sales, week.profit);
    const debtRatio = week.sales === 0 ? 0 : (debt.receivable / week.sales) * 100;
    const liquidity = week.sales === 0 ? 0 : clamp(((week.sales - expenses) / week.sales) * 100, 0, 100);
    const stockTurns = await this.#stockTurnover();

    // A single headline number the owner can watch week to week: healthy
    // margin and liquidity push it up, debt exposure pulls it down.
    const score = Math.round(
      clamp(liquidity * 0.35 + clamp(margin * 2, 0, 100) * 0.3 + (100 - clamp(debtRatio, 0, 100)) * 0.2 + clamp(stockTurns * 15, 0, 100) * 0.15, 0, 100),
    );

    return {
      score,
      metrics: [
        {
          label: 'السيولة النقدية',
          value: round1(liquidity),
          unit: 'percent',
          fill: clamp(liquidity / 100, 0, 1),
          color: '#10B981',
        },
        {
          label: 'هامش الربح',
          value: round1(margin),
          unit: 'percent',
          fill: clamp(margin / 40, 0, 1),
          color: '#059669',
        },
        {
          label: 'نسبة الديون للمبيعات',
          value: round1(debtRatio),
          unit: 'percent',
          fill: clamp(debtRatio / 100, 0, 1),
          color: '#F59E0B',
        },
        {
          label: 'دوران المخزون',
          value: round1(stockTurns),
          unit: 'times',
          fill: clamp(stockTurns / 6, 0, 1),
          color: '#CBD5E1',
        },
      ],
    };
  }

  async #stockTurnover(): Promise<number> {
    const soldCost = Number(
      (await this.db.value('SELECT COALESCE(SUM(cost_piasters * qty), 0) FROM sale_lines')) ?? 0,
    );
    const onHandCost = Number(
      (await this.db.value('SELECT COALESCE(SUM(cost_piasters * qty_on_hand), 0) FROM products')) ??
        0,
    );
    const returnedCost = Number(
      (await this.db.value(
        `SELECT COALESCE(SUM(sl.cost_piasters * sl.qty), 0)
         FROM credit_notes c JOIN invoices i ON i.id = c.invoice_id
         JOIN sale_lines sl ON sl.sale_id = i.sale_id`,
      )) ?? 0,
    );
    if (onHandCost === 0) return 0;
    return Math.max(0, soldCost - returnedCost) / onHandCost;
  }
}

function growth(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function startOfDay(date: Date): Date {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
