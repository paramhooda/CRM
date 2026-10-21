"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, ChevronDown, Search, X, SlidersHorizontal, Loader2 } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { STAGE_META, FORECAST_LABEL, HEALTH_LABEL, ACCOUNT_TYPE_LABEL, REVENUE_MODEL_LABEL, type StageKey } from "@/lib/constants";
import { FLAG_META, FLAG_CODES } from "@/lib/rules/flags";

type Opt = { value: string; label: string; group?: string };
type Dim = { key: string; label: string; options: Opt[]; single?: boolean };

export type FilterOptions = {
  bus: { id: string; name: string }[];
  categories: { id: string; name: string; buId: string; buName: string }[];
  sales: { id: string; name: string }[];
  presales: { id: string; name: string }[];
  oems: { id: string; name: string }[];
};

const ALL_DIMS = ["bu", "cat", "sales", "presales", "oem", "stage", "fc", "health", "atype", "rev", "flag"] as const;
export type DimKey = (typeof ALL_DIMS)[number];

export function FilterBar({
  options,
  dims = ["bu", "cat", "sales", "oem", "stage", "fc", "health", "atype", "rev"],
  showPeriod = true,
  showSearch = true,
  periods,
  hideSales,
}: {
  options: FilterOptions;
  dims?: DimKey[];
  showPeriod?: boolean;
  showSearch?: boolean;
  periods?: { value: string; label: string }[];
  hideSales?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const selectedBu = (sp.get("bu") ?? "").split(",").filter(Boolean);

  const dimensions: Record<DimKey, Dim> = useMemo(
    () => ({
      bu: { key: "bu", label: "Business unit", options: options.bus.map((b) => ({ value: b.id, label: b.name })) },
      cat: {
        key: "cat",
        label: "Category",
        options: options.categories
          .filter((c) => !selectedBu.length || selectedBu.includes(c.buId))
          .map((c) => ({ value: c.id, label: c.name, group: c.buName })),
      },
      sales: { key: "sales", label: "Sales person", options: options.sales.map((u) => ({ value: u.id, label: u.name })) },
      presales: { key: "presales", label: "Presales", options: options.presales.map((u) => ({ value: u.id, label: u.name })) },
      oem: { key: "oem", label: "OEM", options: options.oems.map((o) => ({ value: o.id, label: o.name })) },
      stage: {
        key: "stage",
        label: "Stage",
        options: (Object.keys(STAGE_META) as StageKey[]).map((s) => ({ value: s, label: STAGE_META[s].label })),
      },
      fc: { key: "fc", label: "Forecast", options: (["COMMIT", "UPSIDE", "PIPELINE", "OMITTED"] as const).map((f) => ({ value: f, label: FORECAST_LABEL[f] })) },
      health: { key: "health", label: "Health", options: (["HOT", "HEALTHY", "AT_RISK", "DYING"] as const).map((h) => ({ value: h, label: HEALTH_LABEL[h] })) },
      atype: { key: "atype", label: "Account type", options: Object.entries(ACCOUNT_TYPE_LABEL).map(([value, label]) => ({ value, label })) },
      rev: { key: "rev", label: "Revenue model", options: Object.entries(REVENUE_MODEL_LABEL).map(([value, label]) => ({ value, label })) },
      flag: { key: "flag", label: "Concern", options: FLAG_CODES.map((f) => ({ value: f, label: FLAG_META[f].label })) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options, sp.get("bu")],
  );

  function update(key: string, values: string[] | string | null) {
    const next = new URLSearchParams(sp.toString());
    const v = Array.isArray(values) ? values.join(",") : values;
    if (v) next.set(key, v);
    else next.delete(key);
    if (key === "bu") next.delete("cat");
    next.delete("page");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  useEffect(() => {
    const cur = sp.get("q") ?? "";
    if (q === cur) return;
    const t = setTimeout(() => update("q", q.trim() || null), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const activeKeys = [...ALL_DIMS, "period", "q"].filter((k) => sp.get(k));
  const visibleDims = dims.filter((d) => !(hideSales && d === "sales"));
  const periodOptions = periods ?? [];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 inline-flex items-center gap-1 text-xs text-ink-3">
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <SlidersHorizontal className="size-3.5" />}
        Filters
      </span>
      {showSearch && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="h-7 w-40 rounded-full border border-border bg-surface pl-7 pr-2 text-xs outline-none placeholder:text-ink-3 hover:border-border-strong focus:border-ring"
          />
        </div>
      )}
      {showPeriod && periodOptions.length > 0 && (
        <SingleSelectChip
          label="Period"
          value={sp.get("period")}
          options={periodOptions}
          onChange={(v) => update("period", v)}
        />
      )}
      {visibleDims.map((d) => (
        <MultiSelectChip
          key={d}
          dim={dimensions[d]}
          selected={(sp.get(d) ?? "").split(",").filter(Boolean)}
          onChange={(vals) => update(d, vals)}
        />
      ))}
      {activeKeys.length > 0 && (
        <button
          onClick={() => {
            setQ("");
            const next = new URLSearchParams(sp.toString());
            for (const k of [...ALL_DIMS, "period", "q", "page"]) next.delete(k);
            start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
          }}
          className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs text-ink-3 hover:bg-surface-hover hover:text-ink cursor-pointer"
        >
          <X className="size-3" /> Clear all
        </button>
      )}
    </div>
  );
}

function chipClass(active: boolean) {
  return cn(
    "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors cursor-pointer",
    active
      ? "border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-primary-soft text-[var(--t-blue)]"
      : "border-border bg-surface text-ink-2 hover:border-border-strong hover:text-ink",
  );
}

function MultiSelectChip({ dim, selected, onChange }: { dim: Dim; selected: string[]; onChange: (v: string[]) => void }) {
  const [term, setTerm] = useState("");
  const labels = dim.options.filter((o) => selected.includes(o.value)).map((o) => o.label);
  const filtered = dim.options.filter((o) => o.label.toLowerCase().includes(term.toLowerCase()));
  const groups = [...new Set(filtered.map((o) => o.group ?? ""))];
  return (
    <Popover>
      <PopoverTrigger className={chipClass(selected.length > 0)}>
        <span>{dim.label}</span>
        {selected.length > 0 && (
          <span className="max-w-32 truncate font-medium">
            : {labels.length <= 1 ? labels[0] : `${labels.length} selected`}
          </span>
        )}
        <ChevronDown className="size-3 opacity-60" />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        {dim.options.length > 8 && (
          <div className="border-b border-border p-1.5">
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={`Filter ${dim.label.toLowerCase()}…`}
              className="h-7 w-full rounded-md bg-surface-2 px-2 text-xs outline-none"
            />
          </div>
        )}
        <div className="max-h-72 overflow-y-auto p-1 scrollbar-thin">
          {groups.map((g) => (
            <div key={g}>
              {g && <p className="px-2 pt-1.5 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-3">{g}</p>}
              {filtered
                .filter((o) => (o.group ?? "") === g)
                .map((o) => {
                  const on = selected.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      onClick={() => onChange(on ? selected.filter((x) => x !== o.value) : [...selected, o.value])}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-hover cursor-pointer"
                    >
                      <span className={cn("flex size-4 items-center justify-center rounded border", on ? "border-primary bg-primary text-white" : "border-border-strong")}>
                        {on && <Check className="size-3" strokeWidth={3} />}
                      </span>
                      <span className="truncate">{o.label}</span>
                    </button>
                  );
                })}
            </div>
          ))}
          {filtered.length === 0 && <p className="p-2 text-xs text-ink-3">No options</p>}
        </div>
        {selected.length > 0 && (
          <div className="border-t border-border p-1">
            <button onClick={() => onChange([])} className="w-full rounded-md px-2 py-1.5 text-left text-xs text-ink-3 hover:bg-surface-hover cursor-pointer">
              Clear {dim.label.toLowerCase()}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SingleSelectChip({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (v: string | null) => void;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <Popover>
      <PopoverTrigger className={chipClass(!!value)}>
        <span>{label}</span>
        {current && <span className="font-medium">: {current.label}</span>}
        <ChevronDown className="size-3 opacity-60" />
      </PopoverTrigger>
      <PopoverContent className="w-52">
        {[{ value: "", label: "All time" }, ...options].map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value || null)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-hover cursor-pointer"
          >
            <Check className={cn("size-4 text-primary", (value ?? "") === o.value ? "opacity-100" : "opacity-0")} strokeWidth={3} />
            {o.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
