import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

/** Picklist options for filters and forms (cached per request). */
export const getOptions = cache(async () => {
  const [bus, oems, users, picklists, products] = await Promise.all([
    db.businessUnit.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { categories: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
    }),
    db.oem.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } }),
    db.picklistValue.findMany({ where: { active: true }, orderBy: [{ type: "asc" }, { sortOrder: "asc" }] }),
    db.product.findMany({
      where: { active: true },
      orderBy: [{ oem: { sortOrder: "asc" } }, { code: "asc" }],
      include: { oem: { select: { name: true } }, businessUnit: { select: { name: true } }, category: { select: { name: true } } },
    }),
  ]);
  const pl = (type: string) => picklists.filter((p) => p.type === type).map((p) => p.value);
  return {
    bus: bus.map((b) => ({ id: b.id, name: b.name, code: b.code })),
    categories: bus.flatMap((b) => b.categories.map((c) => ({ id: c.id, name: c.name, buId: b.id, buName: b.name }))),
    oems: oems.map((o) => ({ id: o.id, name: o.name })),
    sales: users.filter((u) => u.role === "SALES" || u.role === "SALES_HEAD").map(({ id, name }) => ({ id, name })),
    presales: users.filter((u) => u.role === "PRESALES").map(({ id, name }) => ({ id, name })),
    purchase: users.filter((u) => u.role === "PURCHASE").map(({ id, name }) => ({ id, name })),
    industries: pl("INDUSTRY"),
    leadSources: pl("LEAD_SOURCE"),
    lossReasons: pl("LOSS_REASON"),
    competitors: pl("COMPETITOR"),
    distributors: pl("DISTRIBUTOR"),
    products: products.map((p) => ({
      id: p.id, code: p.code, name: p.name, oemId: p.oemId, oemName: p.oem.name, businessUnitId: p.businessUnitId,
      buName: p.businessUnit.name, categoryId: p.categoryId, categoryName: p.category.name, productType: p.productType,
      unit: p.unit, billingFrequency: p.billingFrequency, defaultTermMonths: p.defaultTermMonths,
      listPrice: p.listPrice === null ? null : Number(p.listPrice), standardCost: p.standardCost === null ? null : Number(p.standardCost),
      hsnSac: p.hsnSac, gstRatePct: Number(p.gstRatePct),
    })),
  };
});

export type Options = Awaited<ReturnType<typeof getOptions>>;

export type ProductOption = Options["products"][number];
