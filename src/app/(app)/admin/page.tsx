import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, PageBody } from "@/components/crm/page";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PersonCell } from "@/components/crm/badges";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { UserDialog, PicklistEditor, TargetsGrid, RecomputeButton } from "@/components/admin/admin-client";
import { ROLE_LABEL, PICKLIST_TYPES, THRESHOLDS, STAGE_META, type StageKey, type Tone } from "@/lib/constants";
import { FLAG_META, FLAG_CODES } from "@/lib/rules/flags";
import { fiscalPeriod } from "@/lib/fiscal";
import { fmtDateTime, relativeDays, toNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Settings" };
const TABS = [["users", "Users & roles"], ["picklists", "Picklists"], ["targets", "Targets"], ["rules", "Rules"], ["audit", "Audit log"]] as const;
const ROLE_TONE: Record<string, Tone> = { ADMIN: "red", SALES_HEAD: "violet", SALES: "blue", PRESALES: "aqua", PURCHASE: "amber" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; entity?: string }> }) {
  await requireRole("ADMIN");
  const { tab: t, entity } = await searchParams;
  const tab = TABS.some(([k]) => k === t) ? t! : "users";
  return (
    <>
      <PageHeader title="Settings" description="Administration for users, master data, targets and governance">
        <nav className="-mb-4 mt-5 flex gap-1 overflow-x-auto">
          {TABS.map(([k, l]) => (
            <Link key={k} href={`/admin?tab=${k}`} className={cn("whitespace-nowrap border-b-2 px-3 pb-2.5 text-[13px]", tab === k ? "border-ink font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink")}>{l}</Link>
          ))}
        </nav>
      </PageHeader>
      <PageBody>
        {tab === "users" && <Users />}
        {tab === "picklists" && <Picklists />}
        {tab === "targets" && <Targets />}
        {tab === "rules" && <Rules />}
        {tab === "audit" && <Audit entity={entity} />}
      </PageBody>
    </>
  );
}

async function Users() {
  const users = await db.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] });
  return (
    <Card>
      <CardHeader title="Users" description={`${users.filter((u) => u.active).length} active users`} action={<UserDialog />} />
      <Table>
        <THead><tr><TH>Name</TH><TH>Email</TH><TH>Role</TH><TH>Title</TH><TH>Status</TH><TH>Last sign-in</TH><TH /></tr></THead>
        <TBody>
          {users.map((u) => (
            <TR key={u.id}>
              <TD><PersonCell name={u.name} /></TD>
              <TD className="text-xs">{u.email}</TD>
              <TD><Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge></TD>
              <TD className="text-xs text-ink-2">{u.title}</TD>
              <TD>{u.active ? <Badge tone="green" dot>Active</Badge> : <Badge dot>Inactive</Badge>}</TD>
              <TD className="text-xs text-ink-2">{relativeDays(u.lastLoginAt)}</TD>
              <TD className="text-right"><UserDialog id={u.id} initial={{ name: u.name, email: u.email, role: u.role, title: u.title, phone: u.phone, active: u.active }} /></TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

async function Picklists() {
  const [bus, oems, values] = await Promise.all([
    db.businessUnit.findMany({ orderBy: { sortOrder: "asc" }, include: { categories: { orderBy: { sortOrder: "asc" } } } }),
    db.oem.findMany({ orderBy: { sortOrder: "asc" } }),
    db.picklistValue.findMany({ orderBy: [{ type: "asc" }, { sortOrder: "asc" }] }),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-ink-3">Click a value to deactivate it. Deactivated values stay on existing records but are hidden from new entries.</p>
      <h2 className="text-[13px] font-semibold">Business units and categories</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {bus.map((b) => (
          <PicklistEditor key={b.id} title={b.name} type={`CATEGORY:${b.id}`} kind="CATEGORY" values={b.categories.map((c) => ({ id: c.id, label: c.name, active: c.active }))} />
        ))}
      </div>
      <PicklistEditor title="OEMs" type="OEM" kind="OEM" values={oems.map((o) => ({ id: o.id, label: o.name, active: o.active }))} />
      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(PICKLIST_TYPES).map(([type, label]) => (
          <PicklistEditor key={type} title={label} type={type} kind="VALUE" values={values.filter((v) => v.type === type).map((v) => ({ id: v.id, label: v.value, active: v.active }))} />
        ))}
      </div>
    </div>
  );
}

async function Targets() {
  const fy = fiscalPeriod(new Date()).fiscalYear;
  const [reps, targets] = await Promise.all([
    db.user.findMany({ where: { role: "SALES", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.salesTarget.findMany({ where: { fiscalYear: fy } }),
  ]);
  const rows = reps.map((r) => ({
    userId: r.id,
    name: r.name,
    q: [1, 2, 3, 4].map((q) => toNumber(targets.find((t) => t.userId === r.id && t.quarter === q)?.targetAmount ?? 0)),
  }));
  return <TargetsGrid fy={fy} rows={rows} />;
}

function Rules() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Health model" description="Score 0–100 recalculated on every change and every 30 minutes" action={<RecomputeButton />} />
        <CardContent className="flex flex-col gap-2 text-[13px] text-ink-2">
          <p><Badge tone="orange">Hot</Badge> score ≥ 75, Proposal or Negotiation, activity within {THRESHOLDS.warmActivityDays} days, not past close date.</p>
          <p><Badge tone="red">Dying</Badge> no activity for {THRESHOLDS.noActivityDays}+ days, or more than 2× the stage threshold in stage, or close date passed by {THRESHOLDS.overdueGraceDays}+ days, or score below 35.</p>
          <p><Badge tone="amber">At risk</Badge> score below 60, or any critical or serious concern flag.</p>
          <p><Badge tone="green">Healthy</Badge> everything else.</p>
          <div className="mt-2 border-t border-border pt-3">
            <p className="mb-1.5 text-xs font-medium text-ink">Stage defaults</p>
            <table className="w-full text-xs">
              <thead><tr className="text-left text-ink-3"><th className="py-1 font-medium">Stage</th><th className="py-1 text-right font-medium">Probability</th><th className="py-1 text-right font-medium">Stale after</th></tr></thead>
              <tbody>
                {(Object.keys(STAGE_META) as StageKey[]).map((s) => (
                  <tr key={s} className="border-t border-border"><td className="py-1">{STAGE_META[s].label}</td><td className="py-1 text-right tabular">{STAGE_META[s].probability}%</td><td className="py-1 text-right tabular">{STAGE_META[s].staleAfterDays ? `${STAGE_META[s].staleAfterDays}d` : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Concern flags" description="Raised automatically on open deals" />
        <CardContent className="flex flex-col gap-2">
          {FLAG_CODES.map((f) => (
            <div key={f} className="flex items-start gap-2 text-[13px]">
              <Badge tone={FLAG_META[f].severity === "critical" ? "red" : FLAG_META[f].severity === "serious" ? "orange" : "amber"} className="mt-0.5 w-16 justify-center">{FLAG_META[f].severity}</Badge>
              <div><span className="font-medium">{FLAG_META[f].label}.</span> <span className="text-ink-2">{FLAG_META[f].hint}</span></div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

async function Audit({ entity }: { entity?: string }) {
  const logs = await db.auditLog.findMany({
    where: entity ? { entityType: entity } : {},
    orderBy: { changedAt: "desc" },
    take: 300,
    include: { changedBy: { select: { name: true } } },
  });
  const types = ["Opportunity", "Account", "Contact", "Lead", "User", "Picklist", "SalesTarget", "Export"];
  return (
    <Card>
      <CardHeader
        title="Audit log"
        description="Latest 300 events. Every create, update, stage change, login and export is recorded."
        action={
          <div className="flex flex-wrap gap-1">
            {["", ...types].map((x) => (
              <Link key={x} href={`/admin?tab=audit${x ? `&entity=${x}` : ""}`} className={cn("rounded-md px-2 py-0.5 text-xs", (entity ?? "") === x ? "bg-surface-hover font-medium" : "text-ink-3 hover:text-ink")}>{x || "All"}</Link>
            ))}
          </div>
        }
      />
      <Table>
        <THead><tr><TH>When</TH><TH>User</TH><TH>Entity</TH><TH>Action</TH><TH>Field</TH><TH>Old</TH><TH>New</TH></tr></THead>
        <TBody>
          {logs.map((l) => (
            <TR key={l.id}>
              <TD className="whitespace-nowrap text-xs">{fmtDateTime(l.changedAt)}</TD>
              <TD className="text-xs">{l.changedBy?.name ?? "System"}</TD>
              <TD className="text-xs">
                {l.entityType === "Opportunity" ? <Link href={`/opportunities/${l.entityId}?tab=history`} className="text-primary hover:underline">{l.entityType}</Link> : l.entityType}
              </TD>
              <TD><Badge>{l.action}</Badge></TD>
              <TD className="text-xs">{l.field ?? "—"}</TD>
              <TD className="max-w-[180px] truncate text-xs text-ink-3">{l.oldValue ?? "—"}</TD>
              <TD className="max-w-[220px] truncate text-xs">{l.newValue ?? "—"}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
