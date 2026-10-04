import type { XpPoint } from "../gamify";

interface Props {
  readonly points: readonly XpPoint[];
  readonly color: string;
}

const W = 640;
const H = 220;
const PAD = { top: 16, right: 18, bottom: 30, left: 44 };

function niceMax(v: number): number {
  if (v <= 0) return 50;
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / step) * step;
}

const fmtDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** Cumulative XP over time as a stepped area. Days are spaced by real time so gaps show as flat stretches. */
export function XpChart({ points, color }: Props) {
  if (points.length === 0) {
    return <p className="empty">No XP yet. The chart fills in as quests, quizzes and duels are completed.</p>;
  }

  // Single day: pad with a zero point the day before so there is a line to draw.
  const series = points.length === 1
    ? [{ day: new Date(new Date(`${points[0].day}T12:00:00`).getTime() - 86_400_000).toISOString().slice(0, 10), xp: 0 }, ...points]
    : [{ day: points[0].day, xp: 0 }, ...points];

  const t = series.map((p) => new Date(`${p.day}T12:00:00`).getTime());
  const t0 = t[0];
  const t1 = Math.max(t[t.length - 1], t0 + 86_400_000);
  const max = niceMax(series[series.length - 1].xp);
  const x = (ms: number) => PAD.left + ((ms - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (xp: number) => H - PAD.bottom - (xp / max) * (H - PAD.top - PAD.bottom);

  // Step line: XP jumps at the day it was earned.
  const path = series.map((p, i) => {
    const px = x(t[i]);
    const py = y(p.xp);
    if (i === 0) return `M${px},${py}`;
    return `H${px}V${py}`;
  }).join("");
  const area = `${path}V${y(0)}H${x(t[0])}Z`;
  const ticks = [0, max / 2, max];
  const last = series[series.length - 1];

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="xp-chart" role="img" aria-label={`XP over time, reaching ${last.xp} XP on ${fmtDay(last.day)}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="chart-grid" />
            <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" className="chart-label">{v}</text>
          </g>
        ))}
        <path d={area} fill={color} fillOpacity={0.18} />
        <path d={path} fill="none" stroke={color} strokeWidth={3.5} strokeLinejoin="round" />
        <circle cx={x(t[t.length - 1])} cy={y(last.xp)} r={7} fill={color} className="chart-dot" />
        <text x={PAD.left} y={H - 8} className="chart-label">{fmtDay(series[0].day)}</text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" className="chart-label">{fmtDay(last.day)}</text>
      </svg>
    </div>
  );
}
