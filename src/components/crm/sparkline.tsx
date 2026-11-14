"use client";
import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

export type SparkTone = "blue" | "red" | "amber" | "green";
const STROKE: Record<SparkTone, string> = { blue: "var(--tint-blue-foreground)", red: "var(--tint-red-foreground)", amber: "var(--tint-amber-foreground)", green: "var(--tint-green-foreground)" };

/** A small trend line with a soft fill, in one of the four tile tones. */
export function Sparkline({ data, tone = "blue", className }: { data: number[]; tone?: SparkTone; className?: string }) {
  const id = useId().replace(/:/g, "");
  const rows = data.map((v, i) => ({ i, v }));
  return (
    <div className={className} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={STROKE[tone]} stopOpacity={0.25} />
              <stop offset="100%" stopColor={STROKE[tone]} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={STROKE[tone]} strokeWidth={1.75} fill={`url(#spark-${id})`} isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
