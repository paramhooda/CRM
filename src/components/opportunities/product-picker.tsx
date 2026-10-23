"use client";
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Package, PenLine, Search } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { ProductOption } from "@/server/queries/options";
import { inr } from "@/lib/format";
import { BILLING_FREQUENCY_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Searchable catalogue picker grouped by OEM. `null` selection means a custom (non-catalogue) line. */
export function ProductPicker({
  products, value, onChange, allowCustom = true, disabled, placeholder = "Choose product",
}: {
  products: ProductOption[];
  value: string | null | "custom";
  onChange: (p: ProductOption | null) => void;
  allowCustom?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = value && value !== "custom" ? products.find((p) => p.id === value) : undefined;
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const xs = t
      ? products.filter((p) => `${p.code} ${p.name} ${p.oemName} ${p.categoryName} ${p.buName}`.toLowerCase().includes(t))
      : products;
    return xs.slice(0, 120);
  }, [products, q]);
  const groups = [...new Set(filtered.map((p) => p.oemName))];

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label="Product"
          className={cn(
            "flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-left text-[13px] hover:border-border-strong disabled:cursor-default disabled:hover:border-border cursor-pointer",
          )}
        >
          {current ? (
            <>
              <Package className="size-3.5 shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-mono text-[11px] text-ink-3">{current.code}</span> {current.name.replace(`${current.oemName} `, "")}
              </span>
            </>
          ) : value === "custom" ? (
            <>
              <PenLine className="size-3.5 shrink-0 text-ink-3" />
              <span className="flex-1 truncate text-ink-2">Custom line</span>
            </>
          ) : (
            <span className="flex-1 truncate text-ink-3">{placeholder}</span>
          )}
          {!disabled && <ChevronsUpDown className="size-3.5 shrink-0 text-ink-3" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[440px] p-0" align="start">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-3.5 text-ink-3" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search SKU, product, OEM or category"
            className="h-10 w-full bg-transparent text-[13px] outline-none placeholder:text-ink-3"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1 scrollbar-thin">
          {groups.map((g) => (
            <div key={g}>
              <p className="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-ink-3">{g}</p>
              {filtered
                .filter((p) => p.oemName === g)
                .map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => { onChange(p); setOpen(false); }}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-hover cursor-pointer"
                  >
                    <Check className={cn("mt-0.5 size-3.5 shrink-0 text-primary", value === p.id ? "opacity-100" : "opacity-0")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{p.name}</span>
                      <span className="block truncate text-[11px] text-ink-3">
                        <span className="font-mono">{p.code}</span> · {p.buName} / {p.categoryName} · {BILLING_FREQUENCY_LABEL[p.billingFrequency]}
                      </span>
                    </span>
                    {p.listPrice !== null && <span className="shrink-0 text-xs tabular text-ink-2">{inr(p.listPrice)}</span>}
                  </button>
                ))}
            </div>
          ))}
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-xs text-ink-3">No products match. Ask an admin to add it to the catalogue.</p>}
        </div>
        {allowCustom && (
          <div className="border-t border-border p-1">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-ink-2 hover:bg-surface-hover cursor-pointer"
            >
              <PenLine className="size-3.5" /> Custom line (not in catalogue)
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
