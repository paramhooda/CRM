"use client";
import { useEffect, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ComboOption = { value: string; label: string; hint?: string };

/** A searchable picker. Options come from a list, or from a loader called as the user types (accounts, products…). */
export function Combobox({ value, onChange, options, load, placeholder = "Choose…", searchPlaceholder = "Search…", emptyText = "Nothing found.", disabled, invalid, id, className, allowClear }: {
  value: string | null; onChange: (v: string | null, option?: ComboOption) => void; options?: ComboOption[]; load?: (q: string) => Promise<ComboOption[]>; placeholder?: string; searchPlaceholder?: string; emptyText?: string; disabled?: boolean; invalid?: boolean; id?: string; className?: string; allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loaded, setLoaded] = useState<ComboOption[]>([]);
  const [selected, setSelected] = useState<ComboOption | null>(null);
  const [loading, setLoading] = useState(false);
  const list = load ? loaded : (options ?? []).filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()) || o.hint?.toLowerCase().includes(q.toLowerCase()));
  const current = selected?.value === value ? selected : (options ?? loaded).find((o) => o.value === value) ?? null;

  useEffect(() => {
    if (!load || !open) return;
    let alive = true;
    const t = setTimeout(() => {
      setLoading(true);
      load(q).then((rows) => {
        if (!alive) return;
        setLoaded(rows);
        setLoading(false);
      }).catch(() => alive && setLoading(false));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, open, load]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-invalid={invalid} disabled={disabled} className={cn("w-full justify-between font-normal", !current && "text-muted-foreground", className)}>
          <span className="truncate">{current ? current.label : placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>{loading ? "Searching…" : emptyText}</CommandEmpty>
            <CommandGroup>
              {allowClear && value && (
                <CommandItem value="__clear" onSelect={() => { onChange(null); setSelected(null); setOpen(false); }} className="text-muted-foreground">Clear</CommandItem>
              )}
              {list.slice(0, 60).map((o) => (
                <CommandItem key={o.value} value={o.value} onSelect={() => { onChange(o.value, o); setSelected(o); setOpen(false); setQ(""); }}>
                  <Check className={cn("size-4", value === o.value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
