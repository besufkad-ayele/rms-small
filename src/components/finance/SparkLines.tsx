"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { cn, formatMoney } from "@/lib/utils";

export type ChartSeries = {
  key: string;
  label: string;
  values: number[];
  color: string;
};

export type ChartDetail = {
  orders?: number;
};

/** Trend chart with a day readout, grid, and hover. */
export function SparkLines({
  labels,
  series,
  details,
  height = 200,
  className,
}: {
  labels: string[];
  series: ChartSeries[];
  details?: ChartDetail[];
  height?: number;
  className?: string;
}) {
  const width = 480;
  const pad = { t: 16, r: 12, b: 28, l: 44 };
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const all = series.flatMap((s) => s.values);
    const maxVal = Math.max(1, ...all, 0);
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const n = Math.max(1, labels.length - 1);
    const xAt = (i: number) => pad.l + (labels.length <= 1 ? innerW / 2 : (i / n) * innerW);
    const yAt = (v: number) => pad.t + innerH - (v / maxVal) * innerH;

    const paths = series.map((s) => {
      const pts = s.values.map((v, i) => `${xAt(i)},${yAt(v)}`);
      const line = pts.length ? `M ${pts.join(" L ")}` : "";
      const area =
        pts.length > 0
          ? `${line} L ${xAt(pts.length - 1)},${pad.t + innerH} L ${xAt(0)},${pad.t + innerH} Z`
          : "";
      return { ...s, line, area, dots: s.values.map((v, i) => ({ x: xAt(i), y: yAt(v), v })) };
    });

    const ticks = [maxVal, maxVal / 2, 0].map((v) => ({
      y: yAt(v),
      label: compactMoney(v),
    }));

    return { paths, max: maxVal, xAt, ticks, innerH };
  }, [labels, series, height]);

  const active = hover ?? Math.max(0, labels.length - 1);

  if (labels.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl bg-stone/50 text-sm text-ink/45",
          className,
        )}
        style={{ height }}
      >
        No paid sales in this range
      </div>
    );
  }

  function onMove(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestDist = Infinity;
    labels.forEach((_, i) => {
      const dist = Math.abs(model.xAt(i) - x);
      if (dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    });
    setHover(best);
  }

  const day = details?.[active];
  const readout = series.map((s) => ({
    key: s.key,
    label: s.label,
    color: s.color,
    value: s.values[active] ?? 0,
  }));

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl bg-stone/70 px-3 py-2">
          <p className="text-[11px] text-ink/50">{labels[active]}</p>
          <p className="mt-0.5 text-sm font-semibold text-ink">
            {day?.orders ?? 0} orders
          </p>
        </div>
        {readout.map((row) => (
          <div key={row.key} className="rounded-xl bg-stone/70 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[11px] text-ink/50">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: row.color }}
              />
              {row.label}
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">
              {formatMoney(row.value)}
            </p>
          </div>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label="Sales, spend, and net by day"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {model.ticks.map((tick) => (
          <g key={tick.label + tick.y}>
            <line
              x1={pad.l}
              x2={width - pad.r}
              y1={tick.y}
              y2={tick.y}
              stroke="currentColor"
              strokeOpacity={0.12}
            />
            <text
              x={pad.l - 6}
              y={tick.y + 3}
              textAnchor="end"
              className="fill-ink/45"
              fontSize={9}
            >
              {tick.label}
            </text>
          </g>
        ))}

        {model.paths[0]?.area ? (
          <path d={model.paths[0].area} fill={model.paths[0].color} opacity={0.12} />
        ) : null}

        <line
          x1={model.xAt(active)}
          x2={model.xAt(active)}
          y1={pad.t}
          y2={height - pad.b}
          stroke="currentColor"
          strokeOpacity={0.25}
        />

        {model.paths.map((p) => (
          <path
            key={p.key}
            d={p.line}
            fill="none"
            stroke={p.color}
            strokeWidth={2.4}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {model.paths.map((p) => {
          const dot = p.dots[active];
          if (!dot) return null;
          return (
            <circle key={p.key} cx={dot.x} cy={dot.y} r={4} fill={p.color} />
          );
        })}

        {labels.map((lab, i) => {
          const show =
            labels.length <= 8 ||
            i === 0 ||
            i === labels.length - 1 ||
            i === active ||
            i % Math.ceil(labels.length / 6) === 0;
          if (!show) return null;
          return (
            <text
              key={lab + i}
              x={model.xAt(i)}
              y={height - 8}
              textAnchor="middle"
              className="fill-ink/45"
              fontSize={9}
            >
              {lab}
            </text>
          );
        })}
      </svg>
      <p className="mt-1 text-[11px] text-ink/45">
        Hover the chart to read one day. Peak {compactMoney(model.max)} ETB.
      </p>
    </div>
  );
}

function compactMoney(value: number) {
  const n = Math.abs(value);
  if (n >= 1000) {
    const scaled = n / 1000;
    return `${value < 0 ? "−" : ""}${scaled >= 10 ? Math.round(scaled) : scaled.toFixed(1)}k`;
  }
  return String(Math.round(value));
}
