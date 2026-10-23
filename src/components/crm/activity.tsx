"use client";
import { useState } from "react";
import { Phone, Mail, Users, Presentation, MapPin, StickyNote, CheckSquare, Square, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/input";
import { useAction } from "@/components/crm/use-action";
import { logActivity, completeTask } from "@/server/actions/activities";
import { ACTIVITY_TYPE_LABEL } from "@/lib/constants";
import { fmtDateTime, fmtDate, isoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const ACTIVITY_ICON = { CALL: Phone, EMAIL: Mail, MEETING: Users, DEMO: Presentation, SITE_VISIT: MapPin, NOTE: StickyNote, TASK: CheckSquare } as const;
type T = keyof typeof ACTIVITY_ICON;

export function ActivityComposer({
  opportunityId, accountId, contacts,
}: { opportunityId?: string; accountId?: string; contacts: { id: string; firstName: string; lastName: string }[] }) {
  const [type, setType] = useState<T>("CALL");
  const [key, setKey] = useState(0);
  const { pending, run } = useAction();
  return (
    <form
      key={key}
      className="rounded-xl border border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget).entries());
        run(() => logActivity({ ...f, type, opportunityId, accountId }), {
          success: type === "TASK" ? "Task created" : "Activity logged",
          onOk: () => setKey((x) => x + 1),
        });
      }}
    >
      <div className="mb-2 flex flex-wrap gap-1">
        {(Object.keys(ACTIVITY_ICON) as T[]).map((t) => {
          const Icon = ACTIVITY_ICON[t];
          return (
            <button
              type="button"
              key={t}
              onClick={() => setType(t)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs cursor-pointer",
                type === t ? "border-primary bg-primary-soft text-[var(--t-blue)]" : "border-border text-ink-2 hover:bg-surface-hover",
              )}
            >
              <Icon className="size-3.5" /> {ACTIVITY_TYPE_LABEL[t]}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2">
        <Input name="subject" required placeholder={type === "TASK" ? "What needs to be done?" : "Subject, e.g. Solution walkthrough with IT head"} />
        <Textarea name="body" className="min-h-16" placeholder="Notes, outcomes, next steps…" />
        <div className="flex flex-wrap items-center gap-2">
          {type === "TASK" ? (
            <label className="flex items-center gap-1.5 text-xs text-ink-2">
              Due <Input name="dueAt" type="date" defaultValue={isoDate(new Date(Date.now() + 2 * 86_400_000))} className="h-7 w-36" />
            </label>
          ) : (
            <label className="flex items-center gap-1.5 text-xs text-ink-2">
              When <Input name="occurredAt" type="date" defaultValue={isoDate(new Date())} max={isoDate(new Date())} className="h-7 w-36" />
            </label>
          )}
          {contacts.length > 0 && (
            <Select name="contactId" defaultValue="" className="h-7 w-48 text-xs">
              <option value="">No contact</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </Select>
          )}
          <Button type="submit" variant="primary" size="sm" className="ml-auto" disabled={pending}>
            <Send /> {type === "TASK" ? "Add task" : "Log activity"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export type ActivityItem = {
  id: string; type: string; subject: string; body: string | null; occurredAt: Date; dueAt: Date | null; completedAt: Date | null;
  owner: { name: string }; contact: { firstName: string; lastName: string } | null;
};

export function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  const { run } = useAction();
  const tasks = items.filter((a) => a.type === "TASK" && !a.completedAt);
  const log = items.filter((a) => !(a.type === "TASK" && !a.completedAt));
  return (
    <div className="flex flex-col gap-4">
      {tasks.length > 0 && (
        <div className="rounded-xl border border-border bg-surface">
          <p className="border-b border-border px-3 py-2 text-xs font-medium text-ink-2">Open tasks</p>
          {tasks.map((t) => {
            const overdue = t.dueAt && t.dueAt < new Date();
            return (
              <div key={t.id} className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-0">
                <button onClick={() => run(() => completeTask(t.id), { success: "Task completed" })} className="text-ink-3 hover:text-primary cursor-pointer" aria-label="Complete task">
                  <Square className="size-4" />
                </button>
                <span className="flex-1 text-[13px]">{t.subject}</span>
                <span className="text-xs" style={{ color: overdue ? "var(--t-red)" : "var(--ink-3)" }}>
                  {t.dueAt ? `${overdue ? "Overdue · " : "Due "}${fmtDate(t.dueAt)}` : "No due date"}
                </span>
                <span className="text-xs text-ink-3">{t.owner.name}</span>
              </div>
            );
          })}
        </div>
      )}
      <ol className="relative ml-3 border-l border-border">
        {log.map((a) => {
          const Icon = ACTIVITY_ICON[a.type as T] ?? StickyNote;
          return (
            <li key={a.id} className="relative pb-4 pl-6 last:pb-0">
              <span className="absolute -left-3 top-0 flex size-6 items-center justify-center rounded-full border border-border bg-surface">
                <Icon className="size-3 text-ink-2" />
              </span>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="text-[13px] font-medium">{a.subject}</p>
                <span className="text-xs text-ink-3">
                  {ACTIVITY_TYPE_LABEL[a.type as T]} · {a.owner.name}
                  {a.contact && <> with {a.contact.firstName} {a.contact.lastName}</>} · {fmtDateTime(a.occurredAt)}
                </span>
              </div>
              {a.body && <p className="mt-0.5 whitespace-pre-line text-xs text-ink-2">{a.body}</p>}
            </li>
          );
        })}
        {log.length === 0 && <li className="pl-6 text-xs text-ink-3">No activity logged yet.</li>}
      </ol>
    </div>
  );
}
