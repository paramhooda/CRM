"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, Plus, Trash2, Users } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/input";
import { Avatar } from "@/components/crm/badges";
import { completeReview } from "@/server/actions/reviews";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; title: string | null };

/** URL-driven navigation with an optimistic value, so every click registers instantly. */
function useNav<T extends string>(key: string, current: T) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [value, setValue] = useState<T>(current);
  useEffect(() => setValue(current), [current]);
  const go = (v: T, extra: Record<string, string | null> = {}) => {
    setValue(v);
    const next = new URLSearchParams(sp.toString());
    next.set(key, v);
    for (const [k, x] of Object.entries(extra)) {
      if (x === null) next.delete(k);
      else next.set(k, x);
    }
    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  return { value, go, pending };
}

function Progress({ show }: { show: boolean }) {
  return (
    <div aria-hidden className={cn("fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden transition-opacity", show ? "opacity-100" : "opacity-0")}>
      <div className="h-full w-1/3 animate-[crm-progress_1s_ease-in-out_infinite] bg-primary" />
    </div>
  );
}

function Segments<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-ink-3 lg:inline">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-border bg-surface p-0.5">
        {options.map((o) => (
          <button
            key={o.key}
            role="radio"
            aria-checked={value === o.key}
            onClick={() => value !== o.key && onChange(o.key)}
            className={cn(
              "rounded-md px-2.5 py-1 text-[13px] transition-colors cursor-pointer",
              value === o.key ? "bg-ink text-page font-medium" : "text-ink-2 hover:bg-surface-hover hover:text-ink",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ReviewNav({
  people, selected, scopeKind, hasTeam, canChooseOwner, since, sinceOptions, close, closeOptions,
}: {
  people: Person[];
  selected: string[];
  scopeKind: "all" | "team" | "people";
  hasTeam: boolean;
  canChooseOwner: boolean;
  since: string;
  sinceOptions: readonly { key: string; label: string }[];
  close: string;
  closeOptions: readonly { key: string; label: string }[];
}) {
  const whoKey = scopeKind === "all" ? "all" : scopeKind === "team" ? "team" : selected.join(",");
  const who = useNav("who", whoKey);
  const win = useNav("since", since);
  const per = useNav("close", close);
  const [open, setOpen] = useState(false);
  const optimisticIds = who.value === "all" ? people.map((p) => p.id) : who.value === "team" ? selected : who.value.split(",");
  const single = who.value !== "all" && who.value !== "team" && optimisticIds.length === 1 ? optimisticIds[0]! : null;
  const idx = single ? people.findIndex((p) => p.id === single) : -1;
  const label =
    who.value === "all" ? "Everyone" : who.value === "team" ? "My team" : single ? people.find((p) => p.id === single)?.name ?? "—" : `${optimisticIds.length} people`;
  const step = (d: number) => {
    const i = idx < 0 ? (d > 0 ? 0 : people.length - 1) : (idx + d + people.length) % people.length;
    who.go(people[i]!.id);
  };
  const toggle = (id: string) => {
    const base = who.value === "all" || who.value === "team" ? [] : optimisticIds;
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    who.go(next.length ? next.join(",") : "all");
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <Progress show={who.pending || win.pending || per.pending} />
      {canChooseOwner ? (
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} aria-label="Previous sales person" className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-ink-2 hover:text-ink cursor-pointer">
            <ChevronLeft className="size-4" />
          </button>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger className="inline-flex h-9 min-w-52 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-[13px] font-medium hover:border-border-strong cursor-pointer" aria-label="Sales person">
              {single ? <Avatar name={label} className="size-5 text-[9px]" /> : <Users className="size-4 text-ink-3" />}
              <span className="flex-1 truncate text-left">{label}</span>
              <ChevronDown className="size-3.5 opacity-60" />
            </PopoverTrigger>
            <PopoverContent className="w-72 p-1" align="start">
              <Opt on={who.value === "all"} onClick={() => { who.go("all"); setOpen(false); }} icon={<Users className="size-4 text-ink-3" />}>Everyone</Opt>
              {hasTeam && <Opt on={who.value === "team"} onClick={() => { who.go("team"); setOpen(false); }} icon={<Users className="size-4 text-ink-3" />}>My team</Opt>}
              <p className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-ink-3">Sales people · click a name, or tick several</p>
              <div className="max-h-80 overflow-y-auto scrollbar-thin">
                {people.map((p) => {
                  const on = who.value !== "all" && who.value !== "team" && optimisticIds.includes(p.id);
                  return (
                    <div key={p.id} className="flex items-center rounded-md hover:bg-surface-hover">
                      <button onClick={() => toggle(p.id)} aria-label={`Include ${p.name}`} className="p-2 cursor-pointer">
                        <span className={cn("flex size-4 items-center justify-center rounded border", on ? "border-primary bg-primary text-white" : "border-border-strong")}>
                          {on && <Check className="size-3" strokeWidth={3} />}
                        </span>
                      </button>
                      <button onClick={() => { who.go(p.id); setOpen(false); }} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left text-[13px] cursor-pointer">
                        <Avatar name={p.name} className="size-5 text-[9px]" />
                        <span className="truncate">{p.name}</span>
                        <span className="ml-auto truncate text-[11px] text-ink-3">{p.title}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <button onClick={() => step(1)} aria-label="Next sales person" className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-ink-2 hover:text-ink cursor-pointer">
            <ChevronRight className="size-4" />
          </button>
        </div>
      ) : null}
      <Segments label="Changes since" value={win.value} options={sinceOptions} onChange={(v) => win.go(v)} />
      <Segments label="Closing" value={per.value} options={closeOptions} onChange={(v) => per.go(v)} />
    </div>
  );
}

function Opt({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-hover cursor-pointer", on && "font-medium")}>
      {icon}
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
      <DialogContent wide title={`Complete review: ${scopeLabel}`} description="Sets the new baseline for these people. Agreed actions become tasks on their My tasks list.">
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
            <p className="mb-2 text-[13px] font-medium">Actions agreed</p>
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
