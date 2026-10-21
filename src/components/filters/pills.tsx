import Link from "next/link";
import { cn } from "@/lib/utils";

/** Server-rendered single-select pill filter that preserves other query params. */
export function Pills({
  param, options, sp, path, allLabel = "All",
}: {
  param: string;
  options: { value: string; label: string; count?: number }[];
  sp: Record<string, string | string[] | undefined>;
  path: string;
  allLabel?: string;
}) {
  const current = typeof sp[param] === "string" ? (sp[param] as string) : "";
  const href = (v: string) => {
    const q = new URLSearchParams();
    for (const [k, val] of Object.entries(sp)) if (typeof val === "string" && k !== param && k !== "page") q.set(k, val);
    if (v) q.set(param, v);
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };
  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-surface-2 p-0.5">
      {[{ value: "", label: allLabel }, ...options].map((o) => (
        <Link
          key={o.value}
          href={href(o.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs transition-colors",
            current === o.value ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1 text-ink-3 tabular">{o.count}</span>}
        </Link>
      ))}
    </div>
  );
}
