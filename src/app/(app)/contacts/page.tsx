import Link from "next/link";
import { Suspense } from "react";
import { Star } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { accountScope, can } from "@/lib/authz";
import { db } from "@/lib/db";
import { PageHeader, PageBody } from "@/components/crm/page";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/crm/badges";
import { SearchBox } from "@/components/filters/search-box";
import { Pills } from "@/components/filters/pills";
import { ContactDialog } from "@/components/accounts/contact-dialog";
import { CONTACT_ROLE_LABEL } from "@/lib/constants";

export const metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const role = typeof sp.role === "string" ? sp.role : "";
  const ci = { contains: q, mode: "insensitive" as const };
  const [contacts, accounts] = await Promise.all([
    db.contact.findMany({
      where: {
        deletedAt: null,
        account: accountScope(user),
        ...(role ? { role: role as never } : {}),
        ...(q ? { OR: [{ firstName: ci }, { lastName: ci }, { email: ci }, { title: ci }, { account: { name: ci } }] } : {}),
      },
      orderBy: [{ account: { name: "asc" } }, { isPrimary: "desc" }, { firstName: "asc" }],
      include: { account: { select: { id: true, name: true } }, _count: { select: { opportunities: true } } },
      take: 500,
    }),
    db.account.findMany({ where: accountScope(user), select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Contacts" description={`${contacts.length} people across your accounts`} actions={can.manageAccounts(user) && <ContactDialog accounts={accounts} />}>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Suspense><SearchBox placeholder="Search name, email, title, account" /></Suspense>
          <Pills param="role" sp={sp} path="/contacts" allLabel="All roles" options={Object.entries(CONTACT_ROLE_LABEL).slice(0, 6).map(([value, label]) => ({ value, label }))} />
        </div>
      </PageHeader>
      <PageBody>
        <div className="rounded-lg border border-border bg-surface">
          <Table>
            <THead><tr><TH>Name</TH><TH>Account</TH><TH>Buying role</TH><TH>Email</TH><TH>Mobile</TH><TH className="text-right">Deals</TH></tr></THead>
            <TBody>
              {contacts.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={`${c.firstName} ${c.lastName}`} />
                      <div>
                        <p className="flex items-center gap-1 font-medium">{c.firstName} {c.lastName}{c.isPrimary && <Star className="size-3 fill-current" style={{ color: "var(--warning)" }} aria-label="Primary" />}</p>
                        <p className="text-xs text-ink-3">{c.title}</p>
                      </div>
                    </div>
                  </TD>
                  <TD><Link href={`/accounts/${c.account.id}?tab=contacts`} className="hover:text-primary">{c.account.name}</Link></TD>
                  <TD><Badge>{CONTACT_ROLE_LABEL[c.role]}</Badge></TD>
                  <TD className="text-xs">{c.email ? <a href={`mailto:${c.email}`} className="hover:text-primary">{c.email}</a> : "—"}</TD>
                  <TD className="text-xs tabular">{c.mobile ?? c.phone ?? "—"}</TD>
                  <TD className="text-right tabular">{c._count.opportunities}</TD>
                </TR>
              ))}
              {contacts.length === 0 && <tr><td colSpan={6} className="py-12 text-center text-sm text-ink-3">No contacts found.</td></tr>}
            </TBody>
          </Table>
        </div>
      </PageBody>
    </>
  );
}
