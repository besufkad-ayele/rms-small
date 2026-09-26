"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

export type ChartSeries = {
  key: string;
  label: string;
  values: number[];
  color: string;
};

/** Lightweight multi-line SVG chart — no external chart library. */
export function SparkLines({
  labels,
  series,
  height = 160,
  className,
}: {
  labels: string[];
  series: ChartSeries[];
  height?: number;
  className?: string;
}) {
  const width = 400;
  const pad = { t: 12, r: 8, b: 24, l: 8 };

  const { paths, max } = useMemo(() => {
    const all = series.flatMap((s) => s.values);
    const maxVal = Math.max(1, ...all);
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const n = Math.max(1, labels.length - 1);

    const paths = series.map((s) => {
      const pts = s.values.map((v, i) => {
        const x = pad.l + (i / n) * innerW;
        const y = pad.t + innerH - (v / maxVal) * innerH;
        return `${x},${y}`;
      });
      return { ...s, d: pts.length ? `M ${pts.join(" L ")}` : "" };
    });
    return { paths, max: maxVal };
  }, [labels, series, height]);

  if (labels.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl bg-stone/50 text-sm text-ink/45",
          className,
        )}
        style={{ height }}
      >
        No data in this range
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label="Performance chart"
      >
        <line
          x1={pad.l}
          y1={height - pad.b}
          x2={width - pad.r}
          y2={height - pad.b}
          stroke="currentColor"
          strokeOpacity={0.12}
        />
        {paths.map((p) => (
          <path
            key={p.key}
            d={p.d}
            fill="none"
            stroke={p.color}
            strokeWidth={2.25}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {labels.length <= 14
          ? labels.map((lab, i) => {
              const n = Math.max(1, labels.length - 1);
              const x = pad.l + (i / n) * (width - pad.l - pad.r);
              return (
                <text
                  key={lab + i}
                  x={x}
                  y={height - 6}
                  textAnchor="middle"
                  className="fill-ink/40"
                  fontSize={8}
                >
                  {lab}
                </text>
              );
            })
          : null}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink/60">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: s.color }}
            />
            {s.label}
          </span>
        ))}
        <span className="ml-auto text-ink/40">Peak {Math.round(max)}</span>
      </div>
    </div>
  );
}
