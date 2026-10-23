"use client";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Bookmark, Download, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator } from "@/components/ui/dropdown";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Field } from "@/components/ui/input";
import { saveView, deleteView } from "@/server/actions/views";

export function ListToolbar({ views, canCreate }: { views: { id: string; name: string; query: string }[]; canCreate: boolean }) {
  const sp = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const showClosed = sp.get("closed") === "1";
  const qs = sp.toString();

  const presets = [
    { name: "My hot deals", query: "health=HOT" },
    { name: "Dying deals", query: "health=DYING" },
    { name: "Commit this quarter", query: "fc=COMMIT&period=this-q" },
    { name: "Overdue close dates", query: "flag=CLOSE_DATE_OVERDUE" },
    { name: "Won this year", query: "stage=WON&period=this-fy" },
  ];

  return (
    <>
      <label className="inline-flex items-center gap-1.5 text-xs text-ink-2">
        <input
          type="checkbox"
          checked={showClosed}
          onChange={(e) => {
            const next = new URLSearchParams(qs);
            if (e.target.checked) next.set("closed", "1");
            else next.delete("closed");
            router.replace(`${pathname}?${next.toString()}`);
          }}
          className="accent-[var(--primary)]"
        />
        Include closed
      </label>
      <Dropdown>
        <DropdownTrigger asChild>
          <Button><Bookmark /> Views</Button>
        </DropdownTrigger>
        <DropdownContent className="w-60">
          <DropdownLabel>Quick views</DropdownLabel>
          {presets.map((p) => (
            <DropdownItem key={p.name} onSelect={() => router.push(`${pathname}?${p.query}`)}>{p.name}</DropdownItem>
          ))}
          {views.length > 0 && (
            <>
              <DropdownSeparator />
              <DropdownLabel>My saved views</DropdownLabel>
              {views.map((v) => (
                <DropdownItem key={v.id} onSelect={() => router.push(`${pathname}?${v.query}`)}>
                  <span className="flex-1 truncate">{v.name}</span>
                  <span
                    role="button"
                    aria-label={`Delete view ${v.name}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      start(async () => { await deleteView(v.id); toast.success("View deleted"); router.refresh(); });
                    }}
                    className="rounded p-0.5 text-ink-3 hover:text-[var(--t-red)]"
                  >
                    <Trash2 className="size-3.5" />
                  </span>
                </DropdownItem>
              ))}
            </>
          )}
          <DropdownSeparator />
          <DropdownItem disabled={!qs} onSelect={() => setOpen(true)}><Plus /> Save current filters…</DropdownItem>
        </DropdownContent>
      </Dropdown>
      <Dropdown>
        <DropdownTrigger asChild>
          <Button><Download /> Export</Button>
        </DropdownTrigger>
        <DropdownContent className="w-64">
          <DropdownItem asChild><a href={`/api/export/opportunities?${qs}`}>Deals (one row per opportunity)</a></DropdownItem>
          <DropdownItem asChild><a href={`/api/export/opportunities?${qs}${qs ? "&" : ""}mode=lines`}>Line items (one row per product, billing-ready)</a></DropdownItem>
        </DropdownContent>
      </Dropdown>
      {canCreate && (
        <Button asChild variant="primary">
          <Link href="/opportunities/new"><Plus /> New opportunity</Link>
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Save view" description="Saves the current filters and sort so you can come back to them.">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await saveView(pathname, name, qs);
                if (!r.ok) return void toast.error(r.error);
                toast.success("View saved");
                setOpen(false);
                setName("");
                router.refresh();
              });
            }}
            className="flex flex-col gap-3"
          >
            <Field label="Name"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cloud commit deals" /></Field>
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={pending}>Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
