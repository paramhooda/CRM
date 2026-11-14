import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requireActor } from "@/server/auth/actor";
import { allLookups } from "@/server/services/lookups";
import { LOOKUP_LABEL, LOOKUP_TYPES, type LookupType } from "@/contracts/lookups";
import { PageHeader } from "@/components/crm/page-header";

export const metadata: Metadata = { title: "Master data" };

const DESCRIPTION: Record<LookupType, string> = {
  "business-units": "The four lines of business; each has a colour used in charts and tags.",
  "sub-business-units": "Practices within a business unit; flag the ones that need presales.",
  oems: "Vendors whose products are sold; mark Progression's own IP.",
  "lead-sources": "Where leads and deals come from.",
  segments: "Customer size segments.",
  industries: "Customer industries.",
  "loss-reasons": "Why deals are lost or dropped.",
  "document-kinds": "Kinds of files attached to deals; mark sales-only kinds and the one required at Won.",
  "sales-methods": "How third-party products are sold (B2B, MoQ, Stock).",
};
const COUNT_KEY: Record<LookupType, keyof Awaited<ReturnType<typeof allLookups>>> = {
  "business-units": "businessUnits", "sub-business-units": "subBusinessUnits", oems: "oems", "lead-sources": "leadSources", segments: "segments", industries: "industries", "loss-reasons": "lossReasons", "document-kinds": "documentKinds", "sales-methods": "salesMethods",
};

export default async function LookupsIndexPage() {
  const actor = await requireActor();
  if (actor.role !== "ADMIN") redirect("/");
  const L = await allLookups();
  return (
    <>
      <PageHeader title="Master data" description="The lists behind every dropdown. Deactivate values you no longer use; history keeps the old names." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LOOKUP_TYPES.map((t) => (
          <Link key={t} href={`/admin/lookups/${t}`} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-card transition-colors hover:border-border-strong">
            <div>
              <div className="font-medium">{LOOKUP_LABEL[t]}</div>
              <p className="mt-1 text-xs text-muted-foreground">{DESCRIPTION[t]}</p>
              <p className="mt-2 text-xs text-muted-foreground">{(L[COUNT_KEY[t]] as unknown[]).length} active</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </>
  );
}
