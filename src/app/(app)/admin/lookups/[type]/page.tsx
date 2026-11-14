import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireActor } from "@/server/auth/actor";
import { listLookup } from "@/server/services/lookups";
import { db } from "@/server/db";
import { LOOKUP_LABEL, LOOKUP_TYPES, type LookupType } from "@/contracts/lookups";
import { PageHeader } from "@/components/crm/page-header";
import { LookupEditor, type LookupRow } from "./lookup-editor";

export const metadata: Metadata = { title: "Master data" };

export default async function LookupPage({ params }: { params: Promise<{ type: string }> }) {
  const actor = await requireActor();
  if (actor.role !== "ADMIN") redirect("/");
  const { type } = await params;
  if (!(LOOKUP_TYPES as readonly string[]).includes(type)) notFound();
  const t = type as LookupType;
  const [{ rows }, bus] = await Promise.all([listLookup(actor, t, true), t === "sub-business-units" ? db.businessUnit.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }) : Promise.resolve([])]);
  return (
    <>
      <PageHeader title={LOOKUP_LABEL[t]} crumbs={[{ href: "/admin/lookups", label: "Master data" }]} description="Changes show in every dropdown at once. Inactive values stay on old records." />
      <LookupEditor type={t} rows={rows as LookupRow[]} businessUnits={bus} />
    </>
  );
}
