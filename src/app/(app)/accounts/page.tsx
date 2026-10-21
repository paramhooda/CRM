import Link from "next/link";
import { Suspense } from "react";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { accountScope, can, isManager } from "@/lib/authz";
import { db } from "@/lib/db";
import { getOptions } from "@/server/queries/options";
import { PageHeader, PageBody } from "@/components/crm/page";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PersonCell } from "@/components/crm/badges";
import { SearchBox } from "@/components/filters/search-box";
import { Pills } from "@/components/filters/pills";
import { AccountDialog } from "@/components/accounts/account-dialog";
import { inr, toNumber, relativeDays } from "@/lib/format";
import { SEGMENT_LABEL, ACCOUNT_TYPE_LABEL, ACTIVE_STAGES } from "@/lib/constants";
import { fiscalPeriod, fiscalYearRange } from "@/lib/fiscal";

export const metadata = { title: "Accounts" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const type = typeof sp.type === "string" ? sp.type : "";
  const seg = typeof sp.segment === "string" ? sp.segment : "";
  const where: Prisma.AccountWhereInput = {
    AND: [
      accountScope(user),
      q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }, { gstin: { contains: q, mode: "insensitive" } }] } : {},
      type ? { accountType: type as never } : {},
      seg ? { segment: seg as never } : {},
    ],
  };
  const fy = fiscalYearRange(fiscalPeriod(new Date()).fiscalYear);
  const [accounts, options] = await Promise.all([
    db.account.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        owner: { select: { name: true } },
        _count: { select: { contacts: { where: { deletedAt: null } } } },
        opportunities: {
          where: { deletedAt: null },
          select: { amount: true, stage: true, closedAt: true, healthLabel: true, lastActivityAt: true },
        },
      },
    }),
    getOptions(),
  ]);
  return (
    <>
      <PageHeader
        title="Accounts"
        description={`${accounts.length} customers and prospects`}
        actions={can.manageAccounts(user) && <AccountDialog industries={options.industries} owners={isManager(user) ? options.sales : [{ id: user.id, name: user.name }]} canReassign={isManager(user)} />}
      >
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Suspense><SearchBox placeholder="Search name, code, city, GSTIN" /></Suspense>
          <Pills param="type" sp={sp} path="/accounts" options={Object.entries(ACCOUNT_TYPE_LABEL).map(([value, label]) => ({ value, label }))} allLabel="All types" />
          <Pills param="segment" sp={sp} path="/accounts" options={Object.entries(SEGMENT_LABEL).map(([value, label]) => ({ value, label }))} allLabel="All segments" />
        </div>
      </PageHeader>
      <PageBody>
        <div className="rounded-lg border border-border bg-surface">
          <Table>
            <THead>
              <tr>
                <TH>Account</TH><TH>Type</TH><TH>Segment</TH><TH>Industry</TH><TH>Owner</TH>
                <TH className="text-right">Open pipeline</TH><TH className="text-right">Won this FY</TH><TH className="text-right">Lifetime won</TH>
                <TH>At risk</TH><TH>Last activity</TH>
              </tr>
            </THead>
            <TBody>
              {accounts.map((a) => {
                const open = a.opportunities.filter((o) => ACTIVE_STAGES.includes(o.stage as never));
                const won = a.opportunities.filter((o) => o.stage === "WON");
                const wonFy = won.filter((o) => o.closedAt && o.closedAt >= fy.start && o.closedAt < fy.end);
                const risky = open.filter((o) => o.healthLabel === "DYING" || o.healthLabel === "AT_RISK").length;
                const last = a.opportunities.map((o) => o.lastActivityAt).filter(Boolean).sort((x, y) => y!.getTime() - x!.getTime())[0];
                const sum = (xs: typeof open) => xs.reduce((s, o) => s + toNumber(o.amount), 0);
                return (
                  <TR key={a.id}>
                    <TD className="min-w-[220px]">
                      <Link href={`/accounts/${a.id}`} className="font-medium hover:text-primary">{a.name}</Link>
                      <p className="text-xs text-ink-3">{a.code} · {a.city} · {a._count.contacts} contacts</p>
                    </TD>
                    <TD><Badge tone={a.accountType === "EXISTING" ? "green" : "blue"}>{ACCOUNT_TYPE_LABEL[a.accountType]}</Badge></TD>
                    <TD className="text-xs">{SEGMENT_LABEL[a.segment]}</TD>
                    <TD className="text-xs">{a.industry}</TD>
                    <TD><PersonCell name={a.owner.name} /></TD>
                    <TD className="text-right tabular">{inr(sum(open))}<span className="block text-xs text-ink-3">{open.length} deals</span></TD>
                    <TD className="text-right tabular">{inr(sum(wonFy))}</TD>
                    <TD className="text-right tabular">{inr(sum(won))}</TD>
                    <TD>{risky > 0 ? <Badge tone="amber">{risky} deal{risky > 1 ? "s" : ""}</Badge> : <span className="text-xs text-ink-3">—</span>}</TD>
                    <TD className="text-xs text-ink-2">{relativeDays(last)}</TD>
                  </TR>
                );
              })}
              {accounts.length === 0 && <tr><td colSpan={10} className="py-12 text-center text-sm text-ink-3">No accounts found.</td></tr>}
            </TBody>
          </Table>
        </div>
      </PageBody>
    </>
  );
}
