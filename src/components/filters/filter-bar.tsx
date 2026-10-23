"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Command } from "cmdk";
import { toast } from "sonner";
import { Check, ChevronDown, Search, X, SlidersHorizontal, Bookmark, Plus, Trash2, CalendarRange, Info, RotateCcw } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { STAGE_META, FORECAST_LABEL, HEALTH_LABEL, ACCOUNT_TYPE_LABEL, REVENUE_MODEL_LABEL, type StageKey } from "@/lib/constants";
import { FLAG_META, FLAG_CODES } from "@/lib/rules/flags";
import { parsePeriodKey, rangeKey } from "@/lib/fiscal";
import { STATUS_LABEL, lineScopeLabel, parseOppFilters } from "@/lib/filters";
import { inr } from "@/lib/format";
import { saveView, deleteView, listViews } from "@/server/actions/views";

type Opt = { value: string; label: string; group?: string };
type Dim = { key: DimKey; label: string; options: Opt[] };

export type FilterOptions = {
  bus: { id: string; name: string }[];
  categories: { id: string; name: string; buId: string; buName: string }[];
  sales: { id: string; name: string }[];
  presales: { id: string; name: string }[];
  oems: { id: string; name: string; uses?: number }[];
};

const ALL_DIMS = ["bu", "cat", "sales", "presales", "oem", "stage", "fc", "health", "atype", "rev", "flag"] as const;
export type DimKey = (typeof ALL_DIMS)[number];
/** Every URL key the bar owns: cleared by Reset and shown as chips */
const OWNED = [...ALL_DIMS, "status", "age", "created", "minAmt", "period", "q", "page"];

const SERIOUS_FLAGS = FLAG_CODES.filter((f) => FLAG_META[f].severity === "critical" || FLAG_META[f].severity === "serious");

/** One-click presets. Each sets a few params; clicking an active preset removes them again. */
type QuickView = { id: string; label: string; params: Record<string, string> };
function quickViews(me: string | undefined, hideSales: boolean | undefined): QuickView[] {
  return [
    ...(me && !hideSales ? [{ id: "mine", label: "My deals", params: { sales: me } }] : []),
    { id: "quarter", label: "Closing this quarter", params: { period: "this-q" } },
    { id: "commit", label: "Commit", params: { fc: "COMMIT" } },
    { id: "hot", label: "Hot", params: { health: "HOT" } },
    { id: "dying", label: "Dying", params: { health: "DYING" } },
    { id: "large", label: "₹1 Cr+", params: { minAmt: "10000000" } },
    { id: "attention", label: "Needs attention", params: { flag: SERIOUS_FLAGS.join(",") } },
  ];
}

export function FilterBar({
  options,
  dims = ["bu", "cat", "sales", "oem", "stage", "fc", "health", "atype", "rev"],
  showPeriod = true,
  showSearch = true,
  periods,
  hideSales,
  primary,
  me,
  presets = true,
}: {
  options: FilterOptions;
  dims?: DimKey[];
  showPeriod?: boolean;
  showSearch?: boolean;
  periods?: { value: string; label: string; group?: string }[];
  hideSales?: boolean;
  /** Dimensions shown inline; the rest live under "More filters" */
  primary?: DimKey[];
  /** Signed-in user id, for the "My deals" quick view */
  me?: string;
  /** Show the quick views row */
  presets?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [sheet, setSheet] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

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
      // Most-used OEMs first: the long tail rarely matters when filtering
      oem: {
        key: "oem",
        label: "OEM",
        options: [...options.oems].sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0) || a.name.localeCompare(b.name)).map((o) => ({ value: o.id, label: o.name })),
      },
      stage: { key: "stage", label: "Stage", options: (Object.keys(STAGE_META) as StageKey[]).map((s) => ({ value: s, label: STAGE_META[s].label })) },
      fc: { key: "fc", label: "Forecast", options: (["COMMIT", "UPSIDE", "PIPELINE", "OMITTED"] as const).map((f) => ({ value: f, label: FORECAST_LABEL[f] })) },
      health: { key: "health", label: "Health", options: (["HOT", "HEALTHY", "AT_RISK", "DYING"] as const).map((h) => ({ value: h, label: HEALTH_LABEL[h] })) },
      atype: { key: "atype", label: "Account type", options: Object.entries(ACCOUNT_TYPE_LABEL).map(([value, label]) => ({ value, label })) },
      rev: { key: "rev", label: "Revenue model", options: Object.entries(REVENUE_MODEL_LABEL).map(([value, label]) => ({ value, label })) },
      flag: { key: "flag", label: "Concern", options: FLAG_CODES.map((f) => ({ value: f, label: FLAG_META[f].label, group: FLAG_META[f].severity })) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options, sp.get("bu")],
  );

  const replace = (next: URLSearchParams) => start(() => router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`, { scroll: false }));
  function update(key: string, values: string[] | string | null) {
    const next = new URLSearchParams(sp.toString());
    const v = Array.isArray(values) ? values.join(",") : values;
    if (v) next.set(key, v);
    else next.delete(key);
    if (key === "bu") next.delete("cat");
    next.delete("page");
    replace(next);
  }
  function resetAll() {
    setQ("");
    const next = new URLSearchParams(sp.toString());
    for (const k of OWNED) next.delete(k);
    replace(next);
  }

  useEffect(() => {
    const cur = sp.get("q") ?? "";
    if (q === cur) return;
    const t = setTimeout(() => update("q", q.trim() || null), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useEffect(() => setQ(sp.get("q") ?? ""), [sp]);

  // "/" focuses search, like most modern apps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || t.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visibleDims = dims.filter((d) => !(hideSales && d === "sales"));
  const inline = (primary ?? (hideSales ? ["bu", "oem"] : ["bu", "sales"])).filter((d) => visibleDims.includes(d));
  const more = visibleDims.filter((d) => !inline.includes(d));
  const moreActive = more.filter((d) => sp.get(d));
  const selected = (d: string) => (sp.get(d) ?? "").split(",").filter(Boolean);
  const periodOptions = periods ?? [];

  // Active filter chips for everything the bar owns, so it is always clear why a view is filtered
  const chips: { key: string; value: string; label: string; dim: string }[] = [];
  for (const d of ALL_DIMS) {
    for (const v of selected(d)) chips.push({ key: d, value: v, dim: dimensions[d].label, label: dimensions[d].options.find((o) => o.value === v)?.label ?? optionLabel(d, v, options) });
  }
  for (const v of selected("status")) chips.push({ key: "status", value: v, dim: "Status", label: STATUS_LABEL[v] ?? v });
  if (sp.get("age")) chips.push({ key: "age", value: sp.get("age")!, dim: "Age", label: `${sp.get("age")!.replace(/-$/, "+")} days` });
  if (sp.get("minAmt")) chips.push({ key: "minAmt", value: sp.get("minAmt")!, dim: "Value", label: `≥ ${inr(Number(sp.get("minAmt")))}` });
  if (sp.get("created")) chips.push({ key: "created", value: sp.get("created")!, dim: "Created", label: periodLabelFor(sp.get("created")!, periodOptions) });
  if (sp.get("period")) chips.push({ key: "period", value: sp.get("period")!, dim: "Period", label: periodLabelFor(sp.get("period")!, periodOptions) });
  if (sp.get("q")) chips.push({ key: "q", value: sp.get("q")!, dim: "Search", label: `“${sp.get("q")}”` });
  const removeChip = (c: (typeof chips)[number]) => {
    const multi = (ALL_DIMS as readonly string[]).includes(c.key) || c.key === "status";
    if (c.key === "q") setQ("");
    update(c.key, multi ? selected(c.key).filter((x) => x !== c.value) : null);
  };

  const presetList = presets ? quickViews(me, hideSales).filter((p) => Object.keys(p.params).every((k) => k === "minAmt" || (k === "period" ? showPeriod : visibleDims.includes(k as DimKey)))) : [];
  const presetActive = (p: { params: Record<string, string> }) => Object.entries(p.params).every(([k, v]) => sp.get(k) === v);
  const togglePreset = (p: { params: Record<string, string> }) => {
    const next = new URLSearchParams(sp.toString());
    const on = presetActive(p);
    for (const [k, v] of Object.entries(p.params)) {
      if (on) next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    replace(next);
  };

  const scope = lineScopeLabel(parseOppFilters(Object.fromEntries(sp.entries())), options);

  return (
    <div className="flex flex-col gap-3">
      {/* Thin progress bar while the page reloads with new filters */}
      <div aria-hidden className={cn("fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden transition-opacity", pending ? "opacity-100" : "opacity-0")}>
        <div className="h-full w-1/3 animate-[crm-progress_1s_ease-in-out_infinite] bg-primary" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {showSearch && (
          <div className="relative min-w-0 flex-1 sm:max-w-64 sm:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (setQ(""), (e.target as HTMLInputElement).blur())}
              placeholder="Search deals or accounts"
              aria-label="Search"
              className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-7 text-[13px] outline-none placeholder:text-ink-3 hover:border-border-strong focus:border-ring sm:w-64"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1 font-mono text-[10px] text-ink-3 sm:block">/</kbd>
          </div>
        )}

        {/* Desktop: period + primary chips + more. Mobile: one Filters button opening a sheet. */}
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          {showPeriod && periodOptions.length > 0 && <PeriodChip value={sp.get("period")} options={periodOptions} onChange={(v) => update("period", v)} />}
          {inline.map((d) => (
            <MultiSelectChip key={d} dim={dimensions[d]} selected={selected(d)} onChange={(vals) => update(d, vals)} />
          ))}
          {more.length > 0 && (
            <Popover>
              <PopoverTrigger className={chipClass(moreActive.length > 0)}>
                <SlidersHorizontal className="size-3.5" />
                <span>More filters</span>
                {moreActive.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-ink">{moreActive.length}</span>}
              </PopoverTrigger>
              <PopoverContent className="w-[460px] p-0" align="start">
                <DimPanel dims={more.map((d) => dimensions[d])} selected={selected} onChange={update} />
              </PopoverContent>
            </Popover>
          )}
        </div>
        <button onClick={() => setSheet(true)} className={cn(chipClass(chips.length > 0), "md:hidden")}>
          <SlidersHorizontal className="size-3.5" /> Filters
          {chips.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-ink">{chips.length}</span>}
        </button>

        <div className="ml-auto flex items-center gap-1">
          {chips.length > 0 && (
            <button onClick={resetAll} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-ink-2 hover:bg-surface-hover hover:text-ink cursor-pointer">
              <RotateCcw className="size-3.5" /> Reset
            </button>
          )}
          <ViewsMenu page={pathname} />
        </div>
      </div>

      {presetList.length > 0 && (
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-thin" role="group" aria-label="Quick views">
          <span className="shrink-0 pr-1 text-xs text-ink-3">Quick views</span>
          {presetList.map((p) => {
            const on = presetActive(p);
            return (
              <button
                key={p.id}
                aria-pressed={on}
                onClick={() => togglePreset(p)}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-3 text-xs transition-colors cursor-pointer",
                  on ? "border-transparent bg-ink text-page" : "border-border bg-surface text-ink-2 hover:border-border-strong hover:text-ink",
                )}
              >
                {on && <Check className="size-3" strokeWidth={3} />}
                {p.label}
              </button>
            );
          })}
        </div>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {chips.map((c) => (
            <span key={`${c.key}:${c.value}`} className="inline-flex h-7 items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--primary)_25%,transparent)] bg-primary-soft py-0.5 pl-2 pr-1 text-xs text-[var(--t-blue)]">
              <span className="opacity-70">{c.dim}:</span> <span className="max-w-48 truncate font-medium">{c.label}</span>
              <button onClick={() => removeChip(c)} aria-label={`Remove ${c.dim} ${c.label}`} className="rounded p-0.5 hover:bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] cursor-pointer">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {scope && (
        <p className="inline-flex items-center gap-1.5 text-xs text-ink-3">
          <Info className="size-3.5 shrink-0" />
          Values show {scope}&apos;s share of each deal: deals spanning several OEMs or BUs count only their matching line items.
        </p>
      )}

      <Dialog open={sheet} onOpenChange={setSheet}>
        <DialogContent title="Filters" description={chips.length ? `${chips.length} active` : "Narrow down what you see"} className="!top-auto bottom-0 max-h-[85vh] rounded-b-none">
          <div className="-mx-5 -my-4">
            {showPeriod && periodOptions.length > 0 && (
              <div className="border-b border-border px-5 py-4">
                <p className="mb-2 text-xs font-medium text-ink-2">Period</p>
                <div className="flex flex-wrap gap-1.5">
                  {periodOptions.slice(0, 8).map((o) => (
                    <PillToggle key={o.value} on={sp.get("period") === o.value} onClick={() => update("period", sp.get("period") === o.value ? null : o.value)}>{o.label}</PillToggle>
                  ))}
                </div>
              </div>
            )}
            <DimPanel dims={visibleDims.map((d) => dimensions[d])} selected={selected} onChange={update} />
            <div className="sticky bottom-0 flex justify-between gap-2 border-t border-border bg-surface px-5 py-3">
              <Button onClick={resetAll} disabled={!chips.length}>Reset</Button>
              <Button variant="primary" onClick={() => setSheet(false)}>Show results</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function optionLabel(d: string, v: string, options: FilterOptions) {
  const all = [...options.bus, ...options.categories, ...options.sales, ...options.presales, ...options.oems];
  return all.find((x) => x.id === v)?.name ?? (d === "flag" ? FLAG_META[v as keyof typeof FLAG_META]?.label ?? v : v);
}

function periodLabelFor(key: string, opts: { value: string; label: string }[]) {
  return opts.find((o) => o.value === key)?.label ?? parsePeriodKey(key)?.label ?? key;
}

function chipClass(active: boolean) {
  return cn(
    "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] transition-colors cursor-pointer",
    active
      ? "border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-primary-soft text-[var(--t-blue)]"
      : "border-border bg-surface text-ink-2 hover:border-border-strong hover:text-ink",
  );
}

function PillToggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs transition-colors cursor-pointer",
        on ? "border-[color-mix(in_srgb,var(--primary)_40%,transparent)] bg-primary-soft text-[var(--t-blue)]" : "border-border text-ink-2 hover:border-border-strong hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/** All options of several dimensions as pill toggles (More filters popover and the mobile sheet). */
function DimPanel({ dims, selected, onChange }: { dims: Dim[]; selected: (d: string) => string[]; onChange: (k: string, v: string[]) => void }) {
  return (
    <div className="max-h-[60vh] overflow-y-auto px-5 py-4 scrollbar-thin">
      {dims.map((dim) => {
        const sel = selected(dim.key);
        return (
          <div key={dim.key} className="mb-5 last:mb-0">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-ink-2">
                {dim.label}
                {sel.length > 0 && <span className="ml-1.5 text-[var(--t-blue)]">{sel.length}</span>}
              </p>
              {sel.length > 0 && <button onClick={() => onChange(dim.key, [])} className="text-xs text-ink-3 hover:text-ink cursor-pointer">Clear</button>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dim.options.map((o) => {
                const on = sel.includes(o.value);
                return (
                  <PillToggle key={o.value} on={on} onClick={() => onChange(dim.key, on ? sel.filter((x) => x !== o.value) : [...sel, o.value])}>
                    {o.label}
                  </PillToggle>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Searchable, keyboard-navigable multi-select with "Only" and select all. */
function MultiSelectChip({ dim, selected, onChange }: { dim: Dim; selected: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const labels = dim.options.filter((o) => selected.includes(o.value)).map((o) => o.label);
  const groups = [...new Set(dim.options.map((o) => o.group ?? ""))];
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={chipClass(selected.length > 0)}>
        <span>{dim.label}</span>
        {selected.length > 0 && <span className="max-w-36 truncate font-medium">: {labels.length <= 1 ? labels[0] : `${labels.length} selected`}</span>}
        <ChevronDown className="size-3.5 opacity-60" />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0">
        <Command loop className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-border px-2.5">
            <Search className="size-3.5 text-ink-3" />
            <Command.Input autoFocus placeholder={`Search ${dim.label.toLowerCase()}…`} className="h-9 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-3" />
          </div>
          <Command.List className="max-h-72 overflow-y-auto p-1 scrollbar-thin">
            <Command.Empty className="p-3 text-xs text-ink-3">No matches</Command.Empty>
            {groups.map((g) => (
              <Command.Group key={g} heading={g || undefined} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-0.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-ink-3">
                {dim.options
                  .filter((o) => (o.group ?? "") === g)
                  .map((o) => {
                    const on = selected.includes(o.value);
                    return (
                      <Command.Item
                        key={o.value}
                        value={`${o.label} ${o.group ?? ""} ${o.value}`}
                        onSelect={() => toggle(o.value)}
                        className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] data-[selected=true]:bg-surface-hover"
                      >
                        <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-white" : "border-border-strong")}>
                          {on && <Check className="size-3" strokeWidth={3} />}
                        </span>
                        <span className="flex-1 truncate">{o.label}</span>
                        <button
                          type="button"
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onChange([o.value]);
                            setOpen(false);
                          }}
                          className="rounded px-1.5 py-0.5 text-[11px] text-ink-3 opacity-0 hover:bg-surface hover:text-ink group-hover:opacity-100 group-data-[selected=true]:opacity-100 cursor-pointer"
                        >
                          Only
                        </button>
                      </Command.Item>
                    );
                  })}
              </Command.Group>
            ))}
          </Command.List>
          <div className="flex items-center justify-between border-t border-border p-1">
            <button onClick={() => onChange(dim.options.map((o) => o.value))} className="rounded-md px-2 py-1.5 text-xs text-ink-2 hover:bg-surface-hover cursor-pointer">Select all</button>
            <button onClick={() => onChange([])} disabled={!selected.length} className="rounded-md px-2 py-1.5 text-xs text-ink-2 hover:bg-surface-hover disabled:opacity-40 cursor-pointer">Clear</button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Period: fiscal presets, rolling windows and a custom date range. */
function PeriodChip({ value, options, onChange }: { value: string | null; options: { value: string; label: string; group?: string }[]; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const current = value ? periodLabelFor(value, options) : null;
  const custom = value?.startsWith("R") ? value.slice(1).split("_") : null;
  const [from, setFrom] = useState(custom?.[0] ?? "");
  const [to, setTo] = useState(custom?.[1] ?? "");
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  const pickBtn = (o: { value: string; label: string }) => (
    <button
      key={o.value}
      onClick={() => { onChange(o.value); setOpen(false); }}
      className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-hover cursor-pointer", value === o.value && "font-medium text-[var(--t-blue)]")}
    >
      <Check className={cn("size-3.5 text-primary", value === o.value ? "opacity-100" : "opacity-0")} strokeWidth={3} />
      {o.label}
    </button>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={chipClass(!!value)}>
        <CalendarRange className="size-3.5" />
        <span>{current ?? "Period"}</span>
        <ChevronDown className="size-3.5 opacity-60" />
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0">
        <div className="grid grid-cols-2 gap-x-1 p-1">
          {groups.map((g) => (
            <div key={g} className="py-1">
              {g && <p className="px-2 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-3">{g}</p>}
              {options.filter((o) => (o.group ?? "") === g).map(pickBtn)}
            </div>
          ))}
        </div>
        <form
          className="flex items-end gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!from || !to || to < from) return void toast.error("Pick a start and an end date.");
            onChange(rangeKey(from, to));
            setOpen(false);
          }}
        >
          <label className="flex flex-1 flex-col gap-1 text-[11px] text-ink-3">From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Period from" /></label>
          <label className="flex flex-1 flex-col gap-1 text-[11px] text-ink-3">To<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Period to" /></label>
          <Button type="submit" size="sm" variant="primary">Apply</Button>
        </form>
        <div className="border-t border-border p-1">
          <button onClick={() => { onChange(null); setOpen(false); }} className="w-full rounded-md px-2 py-1.5 text-left text-xs text-ink-3 hover:bg-surface-hover cursor-pointer">All time</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Saved filter combinations for the current page, per user. */
function ViewsMenu({ page }: { page: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<{ id: string; name: string; query: string }[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const qs = new URLSearchParams([...sp.entries()].filter(([k]) => k !== "page")).toString();
  const load = () => start(async () => setViews(await listViews(page)));
  return (
    <>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) load(); }}>
        <PopoverTrigger className={chipClass(false)} aria-label="Saved views">
          <Bookmark className="size-3.5" /> <span className="hidden sm:inline">Views</span>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64">
          <p className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-ink-3">My saved views</p>
          {views === null || pending ? (
            <p className="px-2 py-1.5 text-xs text-ink-3">Loading…</p>
          ) : views.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-ink-3">None yet. Set filters, then save them here.</p>
          ) : (
            views.map((v) => (
              <div key={v.id} className="group flex items-center rounded-md hover:bg-surface-hover">
                <button onClick={() => { setOpen(false); router.push(`${page}?${v.query}`); }} className={cn("flex-1 truncate px-2 py-1.5 text-left text-[13px] cursor-pointer", v.query === qs && "font-medium text-[var(--t-blue)]")}>
                  {v.name}
                </button>
                <button
                  aria-label={`Delete view ${v.name}`}
                  onClick={() => start(async () => { await deleteView(v.id); setViews(await listViews(page)); toast.success("View deleted"); })}
                  className="mr-1 rounded p-1 text-ink-3 opacity-0 hover:text-[var(--t-red)] group-hover:opacity-100 cursor-pointer"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          )}
          <div className="mt-1 border-t border-border pt-1">
            <button disabled={!qs} onClick={() => { setOpen(false); setSaving(true); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-hover disabled:opacity-40 cursor-pointer">
              <Plus className="size-3.5" /> Save current filters…
            </button>
          </div>
        </PopoverContent>
      </Popover>
      <Dialog open={saving} onOpenChange={setSaving}>
        <DialogContent title="Save view" description="Saves the current filters so you can come back to them in one click.">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await saveView(page, name, qs);
                if (!r.ok) return void toast.error(r.error);
                toast.success("View saved");
                setSaving(false);
                setName("");
                router.refresh();
              });
            }}
            className="flex flex-col gap-3"
          >
            <Field label="Name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cloud commit deals" /></Field>
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setSaving(false)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={pending}>Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
