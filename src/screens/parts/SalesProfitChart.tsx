/**
 * «المبيعات مقابل الأرباح» — the seven-day area/line chart.
 *
 * The geometry is the one the design specifies: a 640×226 viewBox, gridlines
 * at y = 20/64/108/152/196, x positions at 26 + i·((640−52)/6), and the value
 * axis mapped onto 196 → 20. Only the scale is data-driven, so a good week
 * and a quiet week are both legible.
 */

import { useId } from 'react';
import type { SeriesPoint } from '@/db/repositories/analytics';
import { money, moneyRounded } from '@/lib/format';

const VIEW_W = 640;
const VIEW_H = 226;
const GRID_Y = [20, 64, 108, 152, 196];
const BASE_Y = 196;
const TOP_Y = 20;
const X0 = 26;

export function SalesProfitChart({ points }: { points: readonly SeriesPoint[] }) {
  const gradientId = useId();
  const step = (VIEW_W - 52) / Math.max(1, points.length - 1);
  const x = (i: number): number => X0 + i * step;

  // Round the ceiling up to a friendly number so the top gridline means
  // something, and never divide by zero on a day with no trade.
  const peak = Math.max(1, ...points.map((p) => p.sales));
  const ceiling = niceCeiling(peak);
  const y = (value: number): number => BASE_Y - (value / ceiling) * (BASE_Y - TOP_Y);

  const path = (pick: (p: SeriesPoint) => number): string =>
    points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(pick(p)).toFixed(1)}`).join(' ');

  const area = `${path((p) => p.sales)} L ${x(points.length - 1).toFixed(1)} ${BASE_Y} L ${x(0).toFixed(1)} ${BASE_Y} Z`;

  return (
    <figure style={{ margin: 0 }}>
      <figcaption className="hs-sr-only">
        مبيعات وأرباح آخر سبعة أيام. الذروة {moneyRounded(peak)} جنيه.
      </figcaption>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label="رسم بياني للمبيعات مقابل الأرباح خلال آخر سبعة أيام"
        // Uniform scaling: stretching the viewBox to a fixed height squashes
        // the day labels on a phone, which is exactly where they matter most.
        style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 236, overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {GRID_Y.map((gy) => (
          <line key={gy} x1={0} x2={VIEW_W} y1={gy} y2={gy} stroke="#EEF2F6" strokeWidth={1} />
        ))}

        <path d={area} fill={`url(#${gradientId})`} />

        <path
          d={path((p) => p.profit)}
          fill="none"
          stroke="#0F172A"
          strokeWidth={2}
          strokeDasharray="5 5"
          strokeLinecap="round"
        />

        <path
          d={path((p) => p.sales)}
          fill="none"
          stroke="#059669"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p, i) => (
          <circle
            key={p.label}
            cx={x(i)}
            cy={y(p.sales)}
            r={3.5}
            fill="#fff"
            stroke="#059669"
            strokeWidth={2}
          >
            <title>{`${p.label}: مبيعات ${money(p.sales)} · ربح ${money(p.profit)}`}</title>
          </circle>
        ))}

        {points.map((p, i) => (
          <text
            key={p.label}
            x={x(i)}
            y={221}
            fontSize={11}
            fill="#94A3B8"
            textAnchor="middle"
            fontFamily="inherit"
          >
            {p.label}
          </text>
        ))}
      </svg>
    </figure>
  );
}

/** 1/2/5 × 10ⁿ above the peak, so the axis reads in round numbers. */
function niceCeiling(peak: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  for (const multiple of [1, 1.5, 2, 3, 5, 7.5, 10]) {
    const candidate = magnitude * multiple;
    if (candidate >= peak) return candidate;
  }
  return magnitude * 10;
}
