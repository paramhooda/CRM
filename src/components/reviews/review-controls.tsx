"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, Plus, Trash2, Users } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Avatar } from "@/components/crm/badges";
import { completeReview } from "@/server/actions/reviews";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; title: string | null };

/** URL-driven choice with an optimistic value, so every click registers instantly. */
function useNav(key: string, current: string) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [current]);
  const go = (v: string) => {
    setValue(v);
    const next = new URLSearchParams(sp.toString());
    next.set(key, v);
    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  return { value, go, pending };
}

const chip = (active: boolean) =>
  cn(
    "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] transition-colors cursor-pointer",
    active
      ? "border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-primary-soft text-[var(--t-blue)]"
      : "border-border bg-surface text-ink-2 hover:border-border-strong hover:text-ink",
  );

/** Who is being reviewed and since when. Same chips and toggles as the rest of the app. */
export function ReviewNav({
  people, selected, scopeKind, hasTeam, canChooseOwner, since, sinceOptions,
}: {
  people: Person[];
  selected: string[];
  scopeKind: "all" | "team" | "people";
  hasTeam: boolean;
  canChooseOwner: boolean;
  since: string;
  sinceOptions: readonly { key: string; label: string }[];
}) {
  const whoKey = scopeKind === "all" ? "all" : scopeKind === "team" ? "team" : selected.join(",");
  const who = useNav("who", whoKey);
  const win = useNav("since", since);
  const [open, setOpen] = useState(false);
  const ids = who.value === "all" ? [] : who.value === "team" ? selected : who.value.split(",");
  const single = ids.length === 1 && who.value !== "team" ? ids[0]! : null;
  const idx = single ? people.findIndex((p) => p.id === single) : -1;
  const label =
    who.value === "all" ? "Everyone" : who.value === "team" ? "My team" : single ? people.find((p) => p.id === single)?.name ?? "—" : `${ids.length} people`;
  const step = (d: number) => who.go(people[idx < 0 ? (d > 0 ? 0 : people.length - 1) : (idx + d + people.length) % people.length]!.id);
  const toggle = (id: string) => {
    const base = who.value === "all" || who.value === "team" ? [] : ids;
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    who.go(next.length ? next.join(",") : "all");
  };
  const pending = who.pending || win.pending;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div aria-hidden className={cn("fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden transition-opacity", pending ? "opacity-100" : "opacity-0")}>
        <div className="h-full w-1/3 animate-[crm-progress_1s_ease-in-out_infinite] bg-primary" />
      </div>
      {canChooseOwner && (
        <>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger className={chip(who.value !== "all")} aria-label="Sales person">
              {single ? <Avatar name={label} className="size-5 text-[9px]" /> : <Users className="size-3.5" />}
              <span className="max-w-48 truncate font-medium">{label}</span>
              <ChevronDown className="size-3.5 opacity-60" />
            </PopoverTrigger>
            <PopoverContent className="w-72 p-1" align="start">
              <Row on={who.value === "all"} onClick={() => { who.go("all"); setOpen(false); }}>Everyone</Row>
              {hasTeam && <Row on={who.value === "team"} onClick={() => { who.go("team"); setOpen(false); }}>My team</Row>}
              <p className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-ink-3">Sales people</p>
              <div className="max-h-80 overflow-y-auto scrollbar-thin">
                {people.map((p) => {
                  const on = who.value !== "all" && who.value !== "team" && ids.includes(p.id);
                  return (
                    <div key={p.id} className="flex items-center rounded-md hover:bg-surface-hover">
                      <button onClick={() => toggle(p.id)} aria-label={`Include ${p.name}`} title="Tick to review several people together" className="p-2 cursor-pointer">
                        <span className={cn("flex size-4 items-center justify-center rounded border", on ? "border-primary bg-primary text-white" : "border-border-strong")}>
                          {on && <Check className="size-3" strokeWidth={3} />}
                        </span>
                      </button>
                      <button onClick={() => { who.go(p.id); setOpen(false); }} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left text-[13px] cursor-pointer">
                        <span className="truncate">{p.name}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <div className="flex">
            <button onClick={() => step(-1)} aria-label="Previous sales person" title="Previous sales person" className="inline-flex size-9 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-hover hover:text-ink cursor-pointer">
              <ChevronLeft className="size-4" />
            </button>
            <button onClick={() => step(1)} aria-label="Next sales person" title="Next sales person" className="inline-flex size-9 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-hover hover:text-ink cursor-pointer">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </>
      )}
      <div className="flex min-w-0 max-w-full items-center gap-2">
        <span className="hidden shrink-0 text-[13px] text-ink-3 sm:inline">Changes since</span>
        <Segmented
          label="Changes since"
          value={win.value}
          onChange={(v) => win.value !== v && win.go(v)}
          options={sinceOptions.map((o) => ({ value: o.key, label: o.label }))}
          className="max-w-full overflow-x-auto scrollbar-thin [&_button]:shrink-0 [&_button]:whitespace-nowrap [&_button]:px-2.5 [&_button]:py-1 [&_button]:text-[13px]"
        />
      </div>
    </div>
  );
}

function Row({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-hover cursor-pointer", on && "font-medium")}>
      <Users className="size-3.5 text-ink-3" />
      <span className="flex-1">{children}</span>
      {on && <Check className="size-3.5 text-primary" strokeWidth={3} />}
    </button>
  );
}

type Action = { key: number; subject: string; ownerId: string; dueAt: string; opportunityId: string };
let seq = 0;

/** Complete the review for exactly who is selected, with notes and actions that become tasks. */
export function CompleteReview({
  who, scopeLabel, people, deals, defaultOwner,
}: {
  who: "all" | string[];
  scopeLabel: string;
  people: Person[];
  deals: { id: string; name: string; ownerId: string }[];
  defaultOwner: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const due = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const blank = (): Action => ({ key: ++seq, subject: "", ownerId: defaultOwner, dueAt: due, opportunityId: "" });
  const [actions, setActions] = useState<Action[]>([]);
  const upd = (k: number, p: Partial<Action>) => setActions((xs) => xs.map((a) => (a.key === k ? { ...a, ...p } : a)));
  const owners = who === "all" ? people : people.filter((p) => who.includes(p.id));
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o && !actions.length) setActions([blank()]); }}>
      <DialogTrigger asChild>
        <Button variant="primary"><CheckCheck /> Complete review</Button>
      </DialogTrigger>
      <DialogContent wide title={`Complete review · ${scopeLabel}`} description="Next time, changes are shown from today. Actions become tasks for their owners.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const filled = actions.filter((a) => a.subject.trim());
            start(async () => {
              const r = await completeReview({
                who, notes,
                actions: filled.map((a) => ({ subject: a.subject, ownerId: a.ownerId, dueAt: a.dueAt, opportunityId: a.opportunityId || null })),
              });
              if (!r.ok) return void toast.error(r.error);
              toast.success(filled.length ? `Review recorded · ${filled.length} action${filled.length > 1 ? "s" : ""} assigned` : "Review recorded");
              setOpen(false);
              setNotes("");
              setActions([]);
              router.refresh();
            });
          }}
        >
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Key points from the discussion" />
          </Field>
          <div>
            <p className="mb-2 text-[13px] font-medium">Actions</p>
            <div className="flex flex-col gap-2">
              {actions.map((a, i) => (
                <div key={a.key} className="grid grid-cols-1 gap-2 rounded-lg border border-border p-2 md:grid-cols-[minmax(0,1fr)_150px_170px_130px_32px] md:items-center md:border-0 md:p-0">
                  <Input value={a.subject} onChange={(e) => upd(a.key, { subject: e.target.value })} placeholder="e.g. Re-confirm budget with CIO" aria-label={`Action ${i + 1}`} />
                  <Select value={a.ownerId} onChange={(e) => upd(a.key, { ownerId: e.target.value, opportunityId: "" })} aria-label={`Action ${i + 1} owner`}>
                    {owners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                  <Select value={a.opportunityId} onChange={(e) => upd(a.key, { opportunityId: e.target.value })} aria-label={`Action ${i + 1} deal`}>
                    <option value="">No deal</option>
                    {deals.filter((d) => d.ownerId === a.ownerId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </Select>
                  <Input type="date" value={a.dueAt} onChange={(e) => upd(a.key, { dueAt: e.target.value })} aria-label={`Action ${i + 1} due date`} />
                  <button type="button" onClick={() => setActions((xs) => xs.filter((x) => x.key !== a.key))} aria-label={`Remove action ${i + 1}`} className="justify-self-end rounded p-1.5 text-ink-3 hover:bg-surface-hover hover:text-[var(--t-red)] cursor-pointer">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => setActions((xs) => [...xs, blank()])}><Plus /> Add action</Button>
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>Complete review</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
