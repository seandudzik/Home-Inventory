"use client";

export type CategorySlice = {
  name: string;
  count: number;
  color: string | null;
};

const FALLBACK_COLORS = [
  "#3b82f6", "#22c55e", "#f97316", "#8b5cf6",
  "#ec4899", "#eab308", "#06b6d4", "#ef4444",
];

function sliceColor(slice: CategorySlice, index: number): string {
  if (slice.color) return slice.color;
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

/** Returns SVG path d attribute for a pie slice */
function slicePath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

export default function CategoryPieChart({ slices }: { slices: CategorySlice[] }) {
  const total = slices.reduce((s, c) => s + c.count, 0);

  if (total === 0 || slices.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-400">
        No items to display
      </p>
    );
  }

  const cx = 100, cy = 100, r = 78;
  let angle = -90; // start at 12 o'clock

  const paths = slices.map((slice, i) => {
    const sweep = (slice.count / total) * 360;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    const color = sliceColor(slice, i);
    return { slice, start, end, sweep, color, i };
  });

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Items by Category
      </h2>

      <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        {/* Pie */}
        <svg
          viewBox="0 0 200 200"
          className="w-44 shrink-0 sm:w-48"
          aria-hidden="true"
        >
          {paths.map(({ slice, start, end, sweep, color, i }) =>
            sweep >= 360 ? (
              // Full circle (only 1 category)
              <circle key={i} cx={cx} cy={cy} r={r} fill={color} />
            ) : (
              <path
                key={i}
                d={slicePath(cx, cy, r, start, end)}
                fill={color}
                stroke="white"
                strokeWidth="1.5"
                className="dark:stroke-zinc-900"
              />
            )
          )}
          {/* Donut hole */}
          <circle cx={cx} cy={cy} r={40} className="fill-white dark:fill-zinc-900" />
          {/* Center label */}
          <text x={cx} y={cy - 6} textAnchor="middle" className="fill-zinc-900 dark:fill-zinc-50" fontSize="22" fontWeight="600">
            {total}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" className="fill-zinc-500" fontSize="11">
            items
          </text>
        </svg>

        {/* Legend */}
        <ul className="flex w-full flex-col gap-2">
          {paths.map(({ slice, color, i }) => {
            const pct = Math.round((slice.count / total) * 100);
            return (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-300">
                  {slice.name}
                </span>
                <span className="tabular-nums text-zinc-500">
                  {slice.count}
                  <span className="ml-1 text-xs text-zinc-400">({pct}%)</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
