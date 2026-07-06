"use client";

// Hand-rolled SVG charts: no chart library, no bundle weight, full control
// over the dark theme. Each component is intentionally small and specific.

export type LeaderRow = { label: string; sublabel?: string | null; value: number };

export function formatValue(value: number, format: "int" | "dec1" | "pct"): string {
  if (format === "pct") return `${(value * 100).toFixed(1)}%`;
  if (format === "dec1") return value.toFixed(1);
  return String(Math.round(value));
}

/** Horizontal bar list for leaderboards and categorical agent results. */
export function BarList({
  rows,
  format = "int",
  ranked = false,
}: {
  rows: LeaderRow[];
  format?: "int" | "dec1" | "pct";
  ranked?: boolean;
}) {
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1e-9);
  return (
    <div className="space-y-1.5">
      {rows.map((row, index) => (
        <div key={`${row.label}-${index}`} className="flex items-center gap-2 text-xs">
          {ranked && (
            <div className={`w-4 text-right ${index === 0 ? "font-bold text-amber-400" : "text-zinc-600"}`}>
              {index + 1}
            </div>
          )}
          <div className="w-40 truncate text-zinc-300" title={row.label}>
            {row.label}
            {row.sublabel && <span className="ml-1.5 text-zinc-500">{row.sublabel}</span>}
          </div>
          <div className="h-4 flex-1 rounded-sm bg-zinc-800/60">
            <div
              className="h-4 rounded-sm bg-amber-400/80"
              style={{ width: `${Math.max((Math.abs(row.value) / max) * 100, 1.5)}%` }}
            />
          </div>
          <div className="w-14 text-right font-medium text-zinc-200">
            {formatValue(row.value, format)}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Line chart for sequential agent results (game number / date on x). */
export function TrendChart({
  points,
  yLabel,
}: {
  points: { x: number; xLabel: string; y: number }[];
  yLabel: string;
}) {
  const width = 560;
  const height = 200;
  const pad = { left: 44, right: 12, top: 12, bottom: 26 };

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys);
  const ySpan = yMax - yMin || 1;
  const xSpan = xMax - xMin || 1;

  const px = (x: number) => pad.left + ((x - xMin) / xSpan) * (width - pad.left - pad.right);
  const py = (y: number) => height - pad.bottom - ((y - yMin) / ySpan) * (height - pad.top - pad.bottom);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={`${yLabel} trend`}>
      {[yMin, (yMin + yMax) / 2, yMax].map((tick) => (
        <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={py(tick)} y2={py(tick)} stroke="#27272a" strokeWidth="1" />
          <text x={pad.left - 6} y={py(tick) + 3} textAnchor="end" fontSize="9" fill="#71717a">
            {Number.isInteger(tick) ? tick : tick.toFixed(2)}
          </text>
        </g>
      ))}
      <text x={pad.left} y={height - 8} fontSize="9" fill="#71717a">{points[0]?.xLabel}</text>
      <text x={width - pad.right} y={height - 8} textAnchor="end" fontSize="9" fill="#71717a">
        {points[points.length - 1]?.xLabel}
      </text>
      <path d={path} fill="none" stroke="#fbbf24" strokeWidth="1.8" />
      {points.length <= 60 &&
        points.map((p, i) => (
          <circle key={i} cx={px(p.x)} cy={py(p.y)} r="2.2" fill="#fbbf24">
            <title>{`${p.xLabel}: ${p.y}`}</title>
          </circle>
        ))}
    </svg>
  );
}

/** Percentile radar: player vs comp on 0-1 axes. */
export function RadarChart({
  axes,
  nameA,
  nameB,
}: {
  axes: { label: string; a: number; b: number }[];
  nameA: string;
  nameB: string;
}) {
  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 108;
  const angle = (index: number) => (Math.PI * 2 * index) / axes.length - Math.PI / 2;
  const point = (index: number, value: number) => {
    const r = radius * Math.min(Math.max(value, 0.02), 1);
    return `${(cx + r * Math.cos(angle(index))).toFixed(1)},${(cy + r * Math.sin(angle(index))).toFixed(1)}`;
  };
  const polygon = (key: "a" | "b") => axes.map((axis, i) => point(i, axis[key])).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-sm" role="img" aria-label="percentile radar">
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon
          key={ring}
          points={axes.map((_, i) => point(i, ring)).join(" ")}
          fill="none"
          stroke="#27272a"
          strokeWidth="1"
        />
      ))}
      {axes.map((axis, i) => {
        const [x, y] = point(i, 1.18).split(",").map(Number);
        return (
          <g key={axis.label}>
            <line x1={cx} y1={cy} x2={point(i, 1).split(",")[0]} y2={point(i, 1).split(",")[1]} stroke="#27272a" strokeWidth="1" />
            <text x={x} y={y + 3} textAnchor="middle" fontSize="9" fill="#a1a1aa">
              {axis.label}
            </text>
          </g>
        );
      })}
      <polygon points={polygon("b")} fill="rgba(96,165,250,0.15)" stroke="#60a5fa" strokeWidth="1.5" />
      <polygon points={polygon("a")} fill="rgba(251,191,36,0.15)" stroke="#fbbf24" strokeWidth="1.5" />
      <g fontSize="10">
        <circle cx={16} cy={size - 22} r="4" fill="#fbbf24" />
        <text x={26} y={size - 18} fill="#d4d4d8">{nameA}</text>
        <circle cx={16} cy={size - 8} r="4" fill="#60a5fa" />
        <text x={26} y={size - 4} fill="#d4d4d8">{nameB}</text>
      </g>
    </svg>
  );
}

export type Shot = {
  x_coord: number;
  y_coord: number;
  zone_code: string | null;
  xg: number;
  is_goal: boolean;
  shot_type: string | null;
  strength_state: string | null;
};

/** Half-rink shot map, attacking right. Marker area scales with xG. */
export function ShotMap({ shots, title }: { shots: Shot[]; title: string }) {
  // normalize every shot to attack the +x net; drop defensive-zone attempts
  // (mirroring cannot be resolved for them and they are ~0.5% of attempts)
  const plotted = shots
    .filter((shot) => shot.zone_code !== "D")
    .map((shot) => ({
      ...shot,
      x: Math.min(Math.abs(shot.x_coord), 99),
      y: shot.x_coord >= 0 ? shot.y_coord : -shot.y_coord,
    }));
  const goals = plotted.filter((s) => s.is_goal);

  return (
    <div>
      <div className="mb-1 text-xs font-medium text-zinc-300">
        {title}
        <span className="ml-2 text-zinc-500">
          {plotted.length} attempts · {goals.length} goals
        </span>
      </div>
      <svg viewBox="-2 -44.5 104 89" className="w-full" role="img" aria-label={`${title} shot map`}>
        {/* boards with rounded end corners, center line to end wall */}
        <path
          d="M 0,-42.5 L 72,-42.5 Q 100,-42.5 100,-14.5 L 100,14.5 Q 100,42.5 72,42.5 L 0,42.5"
          fill="#101012"
          stroke="#3f3f46"
          strokeWidth="0.8"
        />
        <line x1="0" y1="-42.5" x2="0" y2="42.5" stroke="#7f1d1d" strokeWidth="0.8" />
        <line x1="25" y1="-42.5" x2="25" y2="42.5" stroke="#1e3a8a" strokeWidth="0.8" />
        <line x1="89" y1="-40" x2="89" y2="40" stroke="#7f1d1d" strokeWidth="0.5" />
        {/* faceoff circles + crease */}
        {[-22, 22].map((y) => (
          <g key={y}>
            <circle cx="69" cy={y} r="15" fill="none" stroke="#3f3f46" strokeWidth="0.5" />
            <circle cx="69" cy={y} r="0.8" fill="#3f3f46" />
          </g>
        ))}
        <path d="M 89,-4 A 5.5 5.5 0 0 0 89,4 Z" fill="#1e3a8a55" stroke="#3f3f46" strokeWidth="0.4" />
        {/* attempts under goals so goals stay visible */}
        {plotted
          .filter((s) => !s.is_goal)
          .map((shot, i) => (
            <circle key={`a${i}`} cx={shot.x} cy={shot.y} r={0.7 + shot.xg * 5} fill="#60a5fa" opacity="0.35">
              <title>{`${shot.shot_type ?? "shot"} · xG ${shot.xg.toFixed(2)} · ${shot.strength_state}`}</title>
            </circle>
          ))}
        {goals.map((shot, i) => (
          <circle key={`g${i}`} cx={shot.x} cy={shot.y} r={0.9 + shot.xg * 5} fill="#fbbf24" stroke="#18181b" strokeWidth="0.3">
            <title>{`GOAL · ${shot.shot_type ?? "shot"} · xG ${shot.xg.toFixed(2)} · ${shot.strength_state}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 text-[10px] text-zinc-500">
        Marker size = xG. Amber = goals. Unblocked attempts with a goalie in net, normalized to attack right.
      </div>
    </div>
  );
}
