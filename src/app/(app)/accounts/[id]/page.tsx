import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Globe, Phone, MapPin, Star, Mail } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { accountScope, can, isManager, opportunityScope } from "@/lib/authz";
import { db } from "@/lib/db";
import { getOptions } from "@/server/queries/options";
import { PageHeader, PageBody, StatTile, DescList } from "@/components/crm/page";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StageBadge, HealthBadge, PersonCell, Avatar } from "@/components/crm/badges";
import { FlagChips } from "@/components/crm/flag-chips";
import { AccountDialog } from "@/components/accounts/account-dialog";
import { ContactDialog, DeleteContactButton } from "@/components/accounts/contact-dialog";
import { ActivityComposer, ActivityTimeline } from "@/components/crm/activity";
import { BarList } from "@/components/charts/charts";
import { inr, fmtDate, toNumber, pct } from "@/lib/format";
import { ACCOUNT_TYPE_LABEL, SEGMENT_LABEL, ACCOUNT_STATUS_LABEL, CONTACT_ROLE_LABEL, ACTIVE_STAGES, type StageKey } from "@/lib/constants";

export const metadata = { title: "Account" };
const TABS = ["overview", "contacts", "activity"] as const;

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { tab: t } = await searchParams;
  const tab = TABS.includes(t as never) ? t! : "overview";
  const a = await db.account.findFirst({
    where: { AND: [{ id }, accountScope(user)] },
    include: {
      owner: { select: { id: true, name: true } },
      contacts: { where: { deletedAt: null }, orderBy: [{ isPrimary: "desc" }, { firstName: "asc" }] },
    },
  });
  if (!a) notFound();
  const [opps, activities, options] = await Promise.all([
    db.opportunity.findMany({
      where: { AND: [{ accountId: id }, opportunityScope(user)] },
      orderBy: [{ closedAt: { sort: "desc", nulls: "first" } }, { amount: "desc" }],
      select: {
        id: true, code: true, name: true, amount: true, stage: true, healthLabel: true, healthScore: true, flags: true, expectedCloseDate: true,
        closedAt: true, businessUnit: { select: { name: true } }, category: { select: { name: true } }, salesOwner: { select: { name: true } },
        revenueModel: true, arrAmount: true, contractEndDate: true,
      },
    }),
    db.activity.findMany({
      where: { accountId: id },
      orderBy: { occurredAt: "desc" },
      take: 60,
      include: { owner: { select: { name: true } }, contact: { select: { firstName: true, lastName: true } } },
    }),
    getOptions(),
  ]);
  const open = opps.filter((o) => ACTIVE_STAGES.includes(o.stage as StageKey));
  const won = opps.filter((o) => o.stage === "WON");
  const lost = opps.filter((o) => o.stage === "LOST");
  const sum = (xs: typeof opps) => xs.reduce((s, o) => s + toNumber(o.amount), 0);
  const winRate = won.length + lost.length ? (won.length / (won.length + lost.length)) * 100 : null;
  const byBu = new Map<string, number>();
  for (const o of won) byBu.set(o.businessUnit.name, (byBu.get(o.businessUnit.name) ?? 0) + toNumber(o.amount));
  const arrRunning = won.filter((o) => o.revenueModel === "ARR" && o.contractEndDate && o.contractEndDate > new Date()).reduce((s, o) => s + toNumber(o.arrAmount), 0);
  const canEdit = can.manageAccounts(user) && (isManager(user) || a.ownerId === user.id);
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/accounts", label: "Accounts" }]}
        tabs={TABS.map((k) => ({ href: `/accounts/${a.id}${k === "overview" ? "" : `?tab=${k}`}`, label: k[0]!.toUpperCase() + k.slice(1), active: tab === k, count: k === "contacts" ? a.contacts.length : undefined }))}
        title={a.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs text-ink-3">{a.code}</span>
            <Badge tone={a.accountType === "EXISTING" ? "green" : "blue"}>{ACCOUNT_TYPE_LABEL[a.accountType]}</Badge>
            <span>{a.industry} · {SEGMENT_LABEL[a.segment]}</span>
            {a.city && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{a.city}, {a.state}</span>}
            {a.website && <a href={a.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary"><Globe className="size-3.5" />{a.website.replace(/^https?:\/\/(www\.)?/, "")}</a>}
          </span>
        }
        actions={
          <>
            {canEdit && (
              <AccountDialog
                id={a.id}
                trigger="edit"
                industries={options.industries}
                owners={options.sales}
                canReassign={isManager(user)}
                initial={{
                  name: a.name, industry: s(a.industry), segment: a.segment, status: a.status, website: s(a.website), phone: s(a.phone),
                  gstin: s(a.gstin), pan: s(a.pan), addressLine: s(a.addressLine), city: s(a.city), state: s(a.state), pincode: s(a.pincode),
                  annualRevenueCr: a.annualRevenueCr ? String(toNumber(a.annualRevenueCr)) : "", employees: s(a.employees), ownerId: a.ownerId,
                  description: s(a.description),
                }}
              />
            )}
            {can.createOpportunity(user) && (
              <Button asChild variant="primary"><Link href={`/opportunities/new?account=${a.id}`}><Plus /> New opportunity</Link></Button>
            )}
          </>
        }
      >
      </PageHeader>
      <PageBody className="flex flex-col gap-6">
        {tab === "overview" && (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              <StatTile label="Open pipeline" value={inr(sum(open))} sub={`${open.length} active deals`} accent="var(--s1)" />
              <StatTile label="Lifetime won" value={inr(sum(won))} sub={`${won.length} deals`} accent="var(--s6)" />
              <StatTile label="Running ARR" value={inr(arrRunning)} sub="Active managed service contracts" accent="var(--s3)" />
              <StatTile label="Win rate" value={winRate === null ? "—" : pct(winRate)} sub={`${won.length} won · ${lost.length} lost`} />
              <StatTile label="Account owner" value={<span className="text-[15px]"><PersonCell name={a.owner.name} /></span>} sub={ACCOUNT_STATUS_LABEL[a.status]} />
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader title="Opportunities" description="Open deals first, then closed history" />
                <CardContent className="px-0 pb-0">
                  {opps.map((o) => (
                    <Link key={o.id} href={`/opportunities/${o.id}`} className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2.5 hover:bg-surface-hover">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{o.name}</p>
                        <p className="text-xs text-ink-3">{o.code} · {o.businessUnit.name} / {o.category.name} · {o.salesOwner.name}</p>
                        <FlagChips flags={o.flags} max={2} className="mt-1" />
                      </div>
                      <StageBadge stage={o.stage} />
                      <HealthBadge label={o.healthLabel} score={o.healthScore} compact />
                      <div className="w-24 text-right">
                        <p className="text-[13px] font-medium tabular">{inr(o.amount)}</p>
                        <p className="text-xs text-ink-3">{o.closedAt ? fmtDate(o.closedAt) : `close ${fmtDate(o.expectedCloseDate, "short")}`}</p>
                      </div>
                    </Link>
                  ))}
                  {opps.length === 0 && <p className="px-4 pb-6 text-sm text-ink-3">No opportunities yet.</p>}
                </CardContent>
              </Card>
              <div className="flex flex-col gap-4">
                <Card>
                  <CardHeader title="Wallet share by business unit" description="Lifetime won value. Gaps are cross-sell openings." />
                  <CardContent>
                    {options.bus.map((b) => b.name).length > 0 && (
                      <BarList data={options.bus.map((b) => ({ label: b.name, value: byBu.get(b.name) ?? 0 }))} color="var(--s6)" />
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader title="Company details" />
                  <CardContent>
                    <DescList cols={1} items={[
                      { label: "GSTIN", value: <span className="font-mono text-xs">{a.gstin ?? "—"}</span> },
                      { label: "PAN", value: <span className="font-mono text-xs">{a.pan ?? "—"}</span> },
                      { label: "Registered address", value: <span className="whitespace-normal">{[a.addressLine, a.city, a.state, a.pincode].filter(Boolean).join(", ")}</span> },
                      { label: "Annual revenue", value: a.annualRevenueCr ? `₹${toNumber(a.annualRevenueCr).toLocaleString("en-IN")} Cr` : "—" },
                      { label: "Employees", value: a.employees?.toLocaleString("en-IN") },
                      { label: "Phone", value: a.phone },
                    ]} />
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
        {tab === "contacts" && (
          <Card>
            <CardHeader title="Contacts" description="Decision makers, influencers and procurement at this customer" action={canEdit && <ContactDialog accountId={a.id} />} />
            <CardContent className="px-0 pb-0">
              {a.contacts.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2.5">
                  <Avatar name={`${c.firstName} ${c.lastName}`} className="size-8" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[13px] font-medium">{c.firstName} {c.lastName}{c.isPrimary && <Star className="size-3 fill-current" style={{ color: "var(--warning)" }} aria-label="Primary" />}</p>
                    <p className="text-xs text-ink-3">{c.title}{c.department ? ` · ${c.department}` : ""}</p>
                  </div>
                  <Badge>{CONTACT_ROLE_LABEL[c.role]}</Badge>
                  <div className="w-64 text-xs text-ink-2">
                    {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-primary"><Mail className="size-3" />{c.email}</a>}
                    {(c.mobile || c.phone) && <p className="flex items-center gap-1"><Phone className="size-3" />{c.mobile ?? c.phone}</p>}
                  </div>
                  {canEdit && (
                    <div className="flex">
                      <ContactDialog mode="edit" id={c.id} accountId={a.id} initial={{ ...c, createdAt: null, updatedAt: null, deletedAt: null }} />
                      <DeleteContactButton id={c.id} />
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        {tab === "activity" && (
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-2"><ActivityComposer accountId={a.id} contacts={a.contacts} /></div>
            <div className="lg:col-span-3"><ActivityTimeline items={activities} /></div>
          </div>
        )}
      </PageBody>
    </>
  );
}
