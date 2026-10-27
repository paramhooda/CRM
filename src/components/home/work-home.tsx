import Link from "next/link";
import { Hourglass, PackageCheck, CheckSquare, Bell, PackageSearch, CalendarX2, ArrowRight } from "lucide-react";
import { PageHeader, PageBody } from "@/components/crm/page";
import { Section } from "@/components/ui/card";
import { WorkQueue, RfqByOem } from "./work-queue";
import type { getPresalesWork, getPurchaseWork } from "@/server/queries/work";
import { fmtDate, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";

type Base = Awaited<ReturnType<typeof getPresalesWork>>;
type Purchase = Awaited<ReturnType<typeof getPurchaseWork>>;

function greeting() {
  const hour = Number(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function plural(n: number, one: string, many = one + "s") {
  return `${n} ${n === 1 ? one : many}`;
}

function Row({ href, title, sub, right, tone }: { href: string; title: string; sub: string; right: React.ReactNode; tone?: "red" }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 border-t border-border px-5 py-3 hover:bg-surface-2/70">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{title}</p>
          <p className="truncate text-xs text-ink-3">{sub}</p>
        </div>
        <span className={cn("shrink-0 text-xs tabular", tone === "red" ? "font-medium text-[var(--t-red)]" : "text-ink-3")}>{right}</span>
      </Link>
    </li>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="border-t border-border px-5 py-6 text-center text-[13px] text-ink-3">{text}</p>;
}

function Tasks({ tasks }: { tasks: Base["tasks"] }) {
  return (
    <Section title="My tasks" icon={<CheckSquare />} tone="violet" flush>
      {tasks.length === 0 ? <Empty text="No open tasks." /> : (
        <ul>
          {tasks.map((t) => (
            <Row key={t.id} href={t.opportunity ? `/opportunities/${t.opportunity.id}?tab=activity` : "/dashboard"} title={t.subject} sub={t.opportunity?.name ?? "General"} right={t.dueAt ? relativeDays(t.dueAt) : "no date"} tone={t.dueAt && t.dueAt < new Date() ? "red" : undefined} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function Updates({ notifications }: { notifications: Base["notifications"] }) {
  return (
    <Section title="Latest updates" icon={<Bell />} tone="slate" flush>
      {notifications.length === 0 ? <Empty text="Nothing new." /> : (
        <ul>
          {notifications.map((n) => (
            <Row key={n.id} href={n.link ?? "/dashboard"} title={n.title} sub={n.body ?? ""} right={relativeDays(n.createdAt)} />
          ))}
        </ul>
      )}
    </Section>
  );
}

export function PresalesHome({ name, data }: { name: string; data: Base }) {
  const overdue = data.queue.filter((q) => q.overdue).length;
  const summary = data.queue.length
    ? `${plural(data.queue.length, "BOQ")} to prepare${overdue ? ` · ${overdue} overdue` : ""}${data.waiting.length ? ` · ${data.waiting.length} waiting on purchase` : ""}`
    : "No BOQs waiting on you right now.";
  return (
    <>
      <PageHeader title={`${greeting()}, ${name.split(" ")[0]}`} description={summary} />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <WorkQueue kind="presales" items={data.queue} />
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <Section title="Waiting on purchase" description="BOQs you submitted that are still being priced" icon={<Hourglass />} tone="amber" flush>
              {data.waiting.length === 0 ? <Empty text="Nothing pending with purchase." /> : (
                <ul>
                  {data.waiting.map((w) => (
                    <Row key={w.id} href={`/opportunities/${w.opp.id}?tab=boq`} title={w.opp.name} sub={`${w.buyer} · ${w.opp.account}`} right={w.overdue ? `late · ${fmtDate(w.dueDate, "short")}` : `due ${fmtDate(w.dueDate, "short")}`} tone={w.overdue ? "red" : undefined} />
                  ))}
                </ul>
              )}
            </Section>
            <Tasks tasks={data.tasks} />
            <Section title="Recently delivered" description="Last 14 days" icon={<PackageCheck />} tone="green" flush>
              {data.delivered.length === 0 ? <Empty text="No BOQs submitted in the last two weeks." /> : (
                <ul>
                  {data.delivered.map((d) => <Row key={d.id} href={`/opportunities/${d.opp.id}?tab=boq`} title={d.opp.name} sub={d.opp.account} right={relativeDays(d.at)} />)}
                </ul>
              )}
            </Section>
            <Updates notifications={data.notifications} />
          </div>
        </div>
      </PageBody>
    </>
  );
}

export function PurchaseHome({ name, data }: { name: string; data: Purchase }) {
  const overdue = data.queue.filter((q) => q.overdue).length;
  const uncosted = data.rfqByOem.reduce((a, x) => a + x.lines, 0);
  const summary = data.queue.length
    ? `${plural(data.queue.length, "BOQ")} to price${overdue ? ` · ${overdue} overdue` : ""} · ${plural(uncosted, "line")} still need a cost`
    : "No pricing requests waiting on you right now.";
  return (
    <>
      <PageHeader title={`${greeting()}, ${name.split(" ")[0]}`} description={summary} />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <WorkQueue kind="purchase" items={data.queue} />
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <Section title="Quotes to request, by OEM" description="Uncosted lines across your queue. Batch one RFQ per OEM; click one to filter your queue." icon={<PackageSearch />} tone="blue">
              <RfqByOem rows={data.rfqByOem} />
            </Section>
            <Section title="Supplier quotes expiring" description="Open deals with a supplier price that lapses within 10 days, or lapsed in the last 30. The earliest is shown." icon={<CalendarX2 />} tone="red" flush>
              {data.expiring.length === 0 ? <Empty text="No supplier quotes expiring soon." /> : (
                <ul>
                  {data.expiring.map((e) => (
                    <Row key={e.id} href={`/opportunities/${e.opp.id}?tab=boq`} title={e.opp.name} sub={`${e.opp.account} · ${e.lines} line${e.lines > 1 ? "s" : ""}`} right={e.expired ? `expired ${fmtDate(e.validTill, "short")}` : `valid till ${fmtDate(e.validTill, "short")}`} tone={e.expired ? "red" : undefined} />
                  ))}
                </ul>
              )}
            </Section>
            <Tasks tasks={data.tasks} />
            <Section title="Recently priced" description="Last 14 days" icon={<PackageCheck />} tone="green" flush>
              {data.priced.length === 0 ? <Empty text="Nothing priced in the last two weeks." /> : (
                <ul>
                  {data.priced.map((d) => <Row key={d.id} href={`/opportunities/${d.opp.id}?tab=boq`} title={d.opp.name} sub={d.opp.account} right={relativeDays(d.at)} />)}
                </ul>
              )}
            </Section>
            <Updates notifications={data.notifications} />
            <Link href="/requests" className="inline-flex items-center gap-1 self-start text-[13px] text-primary hover:underline">All pricing requests <ArrowRight className="size-3.5" /></Link>
          </div>
        </div>
      </PageBody>
    </>
  );
}
