import { cn } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Weekday × hour counts in one blue scale; a cell can link to the hour's records. */
export function Heatmap({ cells, max, hrefFor, className }: { cells: number[][]; max?: number; hrefFor?: (day: number, hour: number) => string; className?: string }) {
  const top = Math.max(1, max ?? Math.max(...cells.flat()));
  const shade = (n: number) => (n === 0 ? undefined : { background: `color-mix(in srgb, var(--primary) ${Math.round(18 + (n / top) * 82)}%, var(--card))` });
  return (
    <div className={cn("overflow-x-auto", className)}>
      <div className="grid min-w-[640px] grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-1 text-[11px] text-muted-foreground">
        <div />
        {Array.from({ length: 24 }, (_, h) => <div key={h} className="text-center">{String(h).padStart(2, "0")}</div>)}
        {cells.map((row, d) => (
          <div key={d} className="contents">
            <div className="flex items-center">{DAYS[d]}</div>
            {row.map((n, h) => {
              const cell = <div className="h-6 w-full rounded-[3px] bg-muted" style={shade(n)} title={`${DAYS[d]} ${String(h).padStart(2, "0")}:00 · ${n}`} />;
              return hrefFor && n > 0 ? <a key={h} href={hrefFor(d, h)} className="block">{cell}</a> : <div key={h}>{cell}</div>;
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span>0</span>
        {[0.2, 0.4, 0.6, 0.8, 1].map((f) => <span key={f} className="h-3 w-6 rounded-[3px]" style={{ background: `color-mix(in srgb, var(--primary) ${Math.round(18 + f * 82)}%, var(--card))` }} />)}
        <span>{top}</span>
      </div>
    </div>
  );
}
