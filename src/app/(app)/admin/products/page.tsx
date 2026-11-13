import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/actor";
import { listProducts } from "@/server/services/products";
import { PageHeader } from "@/components/crm/page-header";
import { ProductsTable } from "./products-table";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; bu?: string; oem?: string; includeInactive?: string; includeDeleted?: string }> }) {
  const actor = await requireActor();
  if (actor.role !== "ADMIN") redirect("/");
  const q = await searchParams;
  const { rows } = await listProducts(actor, { q: q.q, businessUnitId: q.bu, oemId: q.oem, includeInactive: q.includeInactive === "true", includeDeleted: q.includeDeleted === "true" });
  return (
    <>
      <PageHeader title="Product catalogue" description="What sales picks from when adding lines. A product fixes the business unit, Sub BU and OEM of its line." />
      <ProductsTable rows={rows.map((r) => ({ ...r, deletedAt: r.deletedAt?.toISOString() ?? null }))} />
    </>
  );
}
