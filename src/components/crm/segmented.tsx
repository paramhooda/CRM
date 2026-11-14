"use client";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type SegmentedOption<K extends string> = { value: K; label: React.ReactNode };

/** The pill-group control: one option selected, drawn as a white card inside a grey track. Links when `hrefFor` is given. */
export function Segmented<K extends string>({ options, value, onChange, hrefFor, size = "default", className, "aria-label": ariaLabel }: { options: SegmentedOption<K>[]; value: K; onChange?: (v: K) => void; hrefFor?: (v: K) => string; size?: "default" | "sm"; className?: string; "aria-label"?: string }) {
  const item = (o: SegmentedOption<K>) => {
    const active = o.value === value;
    const cls = cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium transition-colors",
      size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
      active ? "bg-card text-foreground shadow-card ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
    );
    return hrefFor ? (
      <Link key={o.value} href={hrefFor(o.value)} className={cls} aria-current={active ? "true" : undefined} scroll={false}>{o.label}</Link>
    ) : (
      <button key={o.value} type="button" className={cls} aria-pressed={active} onClick={() => onChange?.(o.value)}>{o.label}</button>
    );
  };
  return (
    <div role="group" aria-label={ariaLabel} className={cn("inline-flex items-center gap-0.5 rounded-xl bg-muted p-1", className)}>
      {options.map(item)}
    </div>
  );
}
