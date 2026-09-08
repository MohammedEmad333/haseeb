/**
 * «تصدير التقرير» — a CSV of the period's invoices plus the summary figures.
 *
 * Built and saved entirely on the device: no upload, no print service, and
 * therefore nothing to fail when the shop is offline.
 */

import type { SalesRepository } from '@/db/repositories/sales';
import type { OperationsRepository } from '@/db/repositories/operations';
import type { AnalyticsRepository } from '@/db/repositories/analytics';
import { dateFull, money } from './format';

const INVOICE_STATUS_LABEL: Record<string, string> = {
  paid: 'مدفوعة',
  pending: 'معلّقة',
  overdue: 'متأخرة',
};

export async function buildReportCsv(
  sales: SalesRepository,
  ops: OperationsRepository,
  analytics: AnalyticsRepository,
  from: Date,
  to: Date,
): Promise<string> {
  const invoices = await sales.invoices({ from: from.toISOString(), to: to.toISOString() });
  const summary = await analytics.financeSummary(from.toISOString(), to.toISOString());
  const profile = await ops.profile();

  const rows: string[][] = [
    ['تقرير المبيعات والأرباح'],
    ['المنشأة', profile?.name ?? ''],
    ['من', dateFull(from.toISOString())],
    ['إلى', dateFull(to.toISOString())],
    [],
    ['مبلغ الفواتير', money(summary.invoiced)],
    ['عدد الفواتير', String(summary.invoiceCount)],
    ['مبلغ البيع الإجمالي', money(summary.sales)],
    ['الأرباح الإجمالية', money(summary.grossProfit)],
    ['المصروفات', money(summary.expenses)],
    ['صافي الربح', money(summary.netProfit)],
    [],
    ['رقم الفاتورة', 'العميل', 'التاريخ', 'المبلغ', 'الربح', 'الحالة'],
    ...invoices.map((invoice) => [
      invoice.invoiceNo,
      invoice.customerName,
      dateFull(invoice.issuedAt),
      money(invoice.total),
      money(invoice.profit),
      INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status,
    ]),
  ];

  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

export async function exportReportCsv(
  sales: SalesRepository,
  ops: OperationsRepository,
  analytics: AnalyticsRepository,
): Promise<void> {
  const to = new Date();
  const from = new Date(to.getTime());
  from.setDate(from.getDate() - 6);
  from.setHours(0, 0, 0, 0);

  const csv = await buildReportCsv(sales, ops, analytics, from, to);
  // A BOM so Excel opens the Arabic columns in UTF-8 rather than mojibake.
  download(`haseeb-report-${to.toISOString().slice(0, 10)}.csv`, `﻿${csv}`, 'text/csv;charset=utf-8');
}

function escapeCsvCell(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

function download(filename: string, contents: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
