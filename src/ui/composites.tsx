/**
 * Composites built from the primitives — the shapes that repeat across
 * screens: KPI tiles, tinted stat cards, data tables, timelines and the
 * avatar/initial tiles that head every person row.
 */

import type { CSSProperties, ReactNode } from 'react';
import { Badge, Card, Meter, cx } from './primitives';
import { initial } from '@/lib/format';

// ---------------------------------------------------------------------------
// KPI tile
// ---------------------------------------------------------------------------

export function KpiTile({
  label,
  value,
  unit,
  delta,
  deltaTone,
  progress,
  progressColor,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  deltaTone?: 'up' | 'down';
  progress?: number;
  progressColor?: string;
}) {
  return (
    <Card style={{ padding: '16px 17px' }}>
      <div className="hs-row" style={{ justifyContent: 'space-between', gap: 'var(--hs-sp-3)' }}>
        <span style={{ fontSize: 'var(--hs-fs-cell)', color: 'var(--hs-text-muted)', fontWeight: 500 }}>
          {label}
        </span>
        {delta ? (
          <Badge
            className="hs-signed"
            bg={deltaTone === 'down' ? 'var(--hs-danger-bg)' : 'var(--hs-mint-bg)'}
            fg={deltaTone === 'down' ? 'var(--hs-danger-text)' : 'var(--hs-mint-text)'}
          >
            {delta}
          </Badge>
        ) : null}
      </div>
      <div
        className="hs-row"
        style={{ marginBlockStart: 'var(--hs-sp-5)', alignItems: 'baseline', gap: 'var(--hs-sp-2)' }}
      >
        <span
          className="hs-num"
          style={{ fontSize: 'var(--hs-fs-kpi)', fontWeight: 600, letterSpacing: '-0.5px' }}
        >
          {value}
        </span>
        {unit ? <span style={{ fontSize: 'var(--hs-fs-label)', color: 'var(--hs-text-subtle)' }}>{unit}</span> : null}
      </div>
      {progress !== undefined ? (
        <div style={{ marginBlockStart: 'var(--hs-sp-6)' }}>
          <Meter value={progress} color={progressColor ?? 'var(--hs-emerald)'} label={label} />
        </div>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tinted stat card (debt ledger) and accent-topped card (finance)
// ---------------------------------------------------------------------------

export function StatTile({
  label,
  value,
  note,
  bg,
  border,
  labelFg,
  valueFg,
}: {
  label: string;
  value: string;
  note: string;
  bg: string;
  border: string;
  labelFg: string;
  valueFg: string;
}) {
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 'var(--hs-r-card)',
        padding: '15px 17px',
      }}
    >
      <div style={{ fontSize: 'var(--hs-fs-cell)', fontWeight: 500, color: labelFg }}>{label}</div>
      <div
        className="hs-num"
        style={{ fontSize: 25, fontWeight: 600, letterSpacing: '-0.5px', color: valueFg, marginBlockStart: 'var(--hs-sp-3)' }}
      >
        {value}
      </div>
      <div style={{ fontSize: 'var(--hs-fs-badge)', color: labelFg, marginBlockStart: 'var(--hs-sp-2)', opacity: 0.85 }}>
        {note}
      </div>
    </div>
  );
}

export function AccentCard({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  accent: string;
}) {
  return (
    <Card style={{ padding: '15px 17px', borderBlockStart: `3px solid ${accent}` }}>
      <div style={{ fontSize: 'var(--hs-fs-cell)', color: 'var(--hs-text-muted)', fontWeight: 500 }}>{label}</div>
      <div
        className="hs-num"
        style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.5px', marginBlockStart: 'var(--hs-sp-3)' }}
      >
        {value}
      </div>
      <div style={{ fontSize: 'var(--hs-fs-badge)', color: 'var(--hs-text-subtle)', marginBlockStart: 'var(--hs-sp-2)' }}>
        {note}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Avatar / initial tile
// ---------------------------------------------------------------------------

export function InitialTile({
  name,
  size = 38,
  bg = 'var(--hs-mint-bg)',
  border = 'var(--hs-mint-border)',
  fg = 'var(--hs-mint-text)',
  radius,
}: {
  name: string;
  size?: number;
  bg?: string;
  border?: string;
  fg?: string;
  radius?: number;
}) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        borderRadius: radius ?? Math.round(size * 0.32),
        background: bg,
        border: `1px solid ${border}`,
        color: fg,
        fontSize: Math.round(size * 0.37),
        fontWeight: 600,
      }}
    >
      {initial(name)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Data table
// ---------------------------------------------------------------------------

export interface Column<T> {
  key: string;
  header: string;
  /** Fractional width, mirroring the design's grid-template-columns. */
  width?: string;
  align?: 'start' | 'end';
  render: (row: T) => ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  compact,
  empty,
  onRowClick,
}: {
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  caption: string;
  compact?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="hs-table__scroll">
      <table className={cx('hs-table', compact && 'hs-table--compact')}>
        <caption className="hs-sr-only">{caption}</caption>
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" style={c.align === 'end' ? { textAlign: 'end' } : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} style={c.align === 'end' ? { textAlign: 'end' } : undefined}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export interface TimelineItem {
  id: string;
  dot: string;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
}

export function Timeline({ items, label }: { items: readonly TimelineItem[]; label: string }) {
  return (
    <ul className="hs-timeline" aria-label={label}>
      {items.map((item, index) => (
        <li key={item.id} className="hs-timeline__item">
          <span className="hs-timeline__rail" aria-hidden>
            <span className="hs-timeline__dot" style={{ background: item.dot }} />
            {index < items.length - 1 ? <span className="hs-timeline__line" /> : null}
          </span>
          <span className="hs-timeline__body">
            <span style={{ display: 'block', fontSize: 'var(--hs-fs-cell)', fontWeight: 500 }}>
              {item.title}
            </span>
            {item.meta ? (
              <span
                className="hs-num"
                style={{ display: 'block', fontSize: 'var(--hs-fs-meta)', color: 'var(--hs-text-subtle)', marginBlockStart: 2 }}
              >
                {item.meta}
              </span>
            ) : null}
          </span>
          {item.trailing ? <span style={{ flex: 'none' }}>{item.trailing}</span> : null}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Page header
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header
      className="hs-row"
      style={{
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 'var(--hs-sp-8)',
        flexWrap: 'wrap',
        marginBlockEnd: 'var(--hs-sp-9)',
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: 'var(--hs-fs-page)', fontWeight: 600, letterSpacing: '-0.2px' }}>
          {title}
        </h1>
        {sub ? (
          <p style={{ margin: '5px 0 0', fontSize: 'var(--hs-fs-body)', color: 'var(--hs-text-muted)' }}>
            {sub}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="hs-row" style={{ gap: 'var(--hs-sp-4)', flexWrap: 'wrap' }}>
          {actions}
        </div>
      ) : null}
    </header>
  );
}

/** A responsive auto-fit grid — the design's `repeat(auto-fit, minmax(N,1fr))`. */
export function AutoGrid({
  min,
  children,
  style,
  gap = 'var(--hs-gap)',
}: {
  min: number;
  children: ReactNode;
  style?: CSSProperties;
  gap?: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
