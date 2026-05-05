"use client";

import Link from "next/link";

export type PieSlice = {
  name: string;
  count: number;
  color: string | null;
  href?: string;
};

const FALLBACK_COLORS = [
  "#3b82f6", "#22c55e", "#f97316", "#8b5cf6",
  "#ec4899", "#eab308", "#06b6d4", "#ef4444",
];

function sliceColor(slice: PieSlice, index: number): string {
  if (slice.color) return slice.color;
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function slicePath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

interface PieChartProps {
  title: string;
  slices: PieSlice[];
}

export default function PieChart({ title, slices }: PieChartProps) {
  const total = slices.reduce((s, c) => s + c.count, 0);

  if (total === 0 || slices.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</h2>
        <p className="py-8 text-center text-sm text-zinc-400">No data to display</p>
      </div>
    );
  }

  const cx = 100, cy = 100, r = 78;
  let angle = -90;

  const paths = slices.map((slice, i) => {
    const sweep = (slice.count / total) * 360;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    return { slice, start, end, sweep, color: sliceColor(slice, i), i };
  });

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</h2>

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {/* Donut */}
        <svg viewBox="0 0 200 200" className="w-36 shrink-0" aria-hidden="true">
          {paths.map(({ slice, start, end, sweep, color, i }) => {
            const pathEl = sweep >= 360
              ? <circle key={i} cx={cx} cy={cy} r={r} fill={color} />
              : (
                <path
                  key={i}
                  d={slicePath(cx, cy, r, start, end)}
                  fill={color}
                  stroke="white"
                  strokeWidth="1.5"
                  className="dark:stroke-zinc-900 transition-opacity hover:opacity-80"
                />
              );

            return slice.href ? (
              <a key={i} href={slice.href} style={{ cursor: "pointer" }}>
                {sweep >= 360
                  ? <circle cx={cx} cy={cy} r={r} fill={color} className="transition-opacity hover:opacity-80" />
                  : (
                    <path
                      d={slicePath(cx, cy, r, start, end)}
                      fill={color}
                      stroke="white"
                      strokeWidth="1.5"
                      className="dark:stroke-zinc-900 transition-opacity hover:opacity-80"
                    />
                  )
                }
              </a>
            ) : pathEl;
          })}
          {/* Hole */}
          <circle cx={cx} cy={cy} r={40} className="fill-white dark:fill-zinc-900" />
          {/* Center count */}
          <text x={cx} y={cy - 6} textAnchor="middle" className="fill-zinc-900 dark:fill-zinc-50" fontSize="22" fontWeight="600">
            {total}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" className="fill-zinc-500" fontSize="11">
            items
          </text>
        </svg>

        {/* Legend */}
        <ul className="flex w-full flex-col gap-1.5 overflow-hidden">
          {paths.map(({ slice, color, i }) => {
            const pct = Math.round((slice.count / total) * 100);
            const inner = (
              <div className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-300">{slice.name}</span>
                <span className="shrink-0 tabular-nums text-zinc-500">
                  {slice.count}
                  <span className="ml-1 text-xs text-zinc-400">({pct}%)</span>
                </span>
              </div>
            );

            return slice.href ? (
              <li key={i}>
                <Link href={slice.href} className="block">{inner}</Link>
              </li>
            ) : (
              <li key={i}>{inner}</li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
