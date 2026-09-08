/** «توزيع المبيعات» — the sales-channel donut. */

import type { ChannelShare } from '@/db/repositories/analytics';
import { moneyCompact, percent } from '@/lib/format';

export function ChannelDonut({
  segments,
  total,
}: {
  segments: readonly ChannelShare[];
  total: number;
}) {
  // Build the conic-gradient stops from the real shares rather than a fixed
  // string, so the ring always matches the legend beside it.
  let cursor = 0;
  const stops = segments
    .map((s) => {
      const from = cursor;
      cursor += s.share;
      return `${s.color} ${from.toFixed(2)}% ${cursor.toFixed(2)}%`;
    })
    .join(', ');

  const empty = total === 0;

  return (
    <div className="hs-stack" style={{ alignItems: 'center', gap: 'var(--hs-sp-9)' }}>
      <div
        role="img"
        aria-label={`توزيع المبيعات: ${segments.map((s) => `${s.label} ${percent(Math.round(s.share))}`).join('، ')}`}
        style={{
          width: 152,
          height: 152,
          borderRadius: '50%',
          background: empty ? 'var(--hs-divider)' : `conic-gradient(${stops})`,
          display: 'grid',
          placeItems: 'center',
          flex: 'none',
        }}
      >
        <div
          style={{
            width: 98,
            height: 98,
            borderRadius: '50%',
            background: 'var(--hs-surface)',
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
          }}
        >
          <div>
            <div className="hs-num" style={{ fontSize: 19, fontWeight: 600 }}>
              {moneyCompact(total)}
            </div>
            <div style={{ fontSize: 'var(--hs-fs-micro)', color: 'var(--hs-text-subtle)' }}>
              إجمالي الأسبوع
            </div>
          </div>
        </div>
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, width: '100%', display: 'grid', gap: 'var(--hs-sp-4)' }}>
        {segments.map((segment) => (
          <li key={segment.channel} className="hs-row" style={{ gap: 'var(--hs-sp-4)' }}>
            <span
              aria-hidden
              style={{ width: 9, height: 9, borderRadius: 3, background: segment.color, flex: 'none' }}
            />
            <span style={{ flex: 1, fontSize: 'var(--hs-fs-cell)', color: 'var(--hs-text-slate)' }}>
              {segment.label}
            </span>
            <span className="hs-num" style={{ fontSize: 'var(--hs-fs-cell)', fontWeight: 600 }}>
              {percent(Math.round(segment.share))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
