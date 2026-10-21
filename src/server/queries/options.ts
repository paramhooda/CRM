import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

/** Picklist options for filters and forms (cached per request). */
export const getOptions = cache(async () => {
  const [bus, oems, users, picklists] = await Promise.all([
    db.businessUnit.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { categories: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
    }),
    db.oem.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } }),
    db.picklistValue.findMany({ where: { active: true }, orderBy: [{ type: "asc" }, { sortOrder: "asc" }] }),
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
  };
});

export type Options = Awaited<ReturnType<typeof getOptions>>;
