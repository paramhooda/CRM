"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryString } from "@/lib/url-state";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string };
export type FilterDef = { key: string; label: string; options: FilterOption[]; width?: string };

/** The one filter bar: a search box and selects, all written to the URL so lists, charts and exports agree. */
export function FilterBar({ filters, search, className, children }: { filters: FilterDef[]; search?: { placeholder: string }; className?: string; children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const urlQ = params.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const [seenUrlQ, setSeenUrlQ] = useState(urlQ);
  if (urlQ !== seenUrlQ) {
    // The URL changed under us (back button, Clear): follow it
    setSeenUrlQ(urlQ);
    setQ(urlQ);
  }

  const apply = (patch: Record<string, string | null>) => startTransition(() => router.replace(`${pathname}${queryString(params, patch)}`, { scroll: false }));
  const active = filters.filter((f) => params.get(f.key)).length + (params.get("q") ? 1 : 0);

  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-2", className)}>
      {search && (
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q: q.trim() || null });
          }}
        >
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={search.placeholder} aria-label="Search" className="h-8 w-56 pl-8" />
        </form>
      )}
      {filters.map((f) => (
        <Select key={f.key} value={params.get(f.key) ?? "__all"} onValueChange={(v) => apply({ [f.key]: v === "__all" ? null : v })}>
          <SelectTrigger size="sm" aria-label={f.label} className={cn("h-8", f.width ?? "w-auto min-w-36")}>
            <SelectValue placeholder={f.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">{f.label}: all</SelectItem>
            {f.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {children}
      {active > 0 && (
        <Button variant="ghost" size="sm" onClick={() => apply(Object.fromEntries([...filters.map((f) => [f.key, null]), ["q", null]]))}>
          <X /> Clear
        </Button>
      )}
    </div>
  );
}
