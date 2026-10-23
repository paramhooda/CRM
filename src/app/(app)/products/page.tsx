import { Suspense } from "react";
import type { Prisma } from "@prisma/client";
import { Package } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { db } from "@/lib/db";
import { getOptions } from "@/server/queries/options";
import { PageHeader, PageBody, StatTile, EmptyState } from "@/components/crm/page";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SearchBox } from "@/components/filters/search-box";
import { Pills } from "@/components/filters/pills";
import { ProductDialog, ToggleProductButton } from "@/components/products/product-dialog";
import { inr, pct, toNumber } from "@/lib/format";
import { lineValue } from "@/lib/boq";
import { PRODUCT_TYPE_LABEL, BILLING_FREQUENCY_LABEL, type Tone } from "@/lib/constants";

export const metadata = { title: "Products" };
const TYPE_TONE: Record<string, Tone> = { HARDWARE: "blue", SOFTWARE_LICENCE: "violet", SUBSCRIPTION: "aqua", SERVICE: "green", SUPPORT_AMC: "amber" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = one("q");
  const ci = { contains: q, mode: "insensitive" as const };
  const where: Prisma.ProductWhereInput = {
    AND: [
      q ? { OR: [{ code: ci }, { name: ci }, { oem: { name: ci } }, { category: { name: ci } }, { hsnSac: { contains: q } }] } : {},
      one("bu") ? { businessUnitId: one("bu") } : {},
      one("type") ? { productType: one("type") as never } : {},
      one("status") === "inactive" ? { active: false } : one("status") === "all" ? {} : { active: true },
    ],
  };
  const [products, options, usage] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: [{ oem: { sortOrder: "asc" } }, { code: "asc" }],
      include: { oem: { select: { name: true } }, businessUnit: { select: { name: true } }, category: { select: { name: true } } },
    }),
    getOptions(),
    db.opportunityLineItem.findMany({
      where: { productId: { not: null }, opportunity: { deletedAt: null } },
      select: { productId: true, quantity: true, unitPrice: true, billingFrequency: true, termMonths: true, opportunity: { select: { stage: true } } },
    }),
  ]);
  const use = new Map<string, { deals: number; open: number; won: number }>();
  for (const u of usage) {
    const x = use.get(u.productId!) ?? { deals: 0, open: 0, won: 0 };
    x.deals++;
    const v = lineValue(u);
    if (u.opportunity.stage === "WON") x.won += v;
    else if (!["LOST", "DROPPED"].includes(u.opportunity.stage)) x.open += v;
    use.set(u.productId!, x);
  }
  const totalActive = await db.product.count({ where: { active: true } });
  const oemCount = new Set(products.map((p) => p.oemId)).size;
  const topWon = [...use.entries()].sort((a, b) => b[1].won - a[1].won)[0];
  const topProduct = topWon ? products.find((p) => p.id === topWon[0]) ?? (await db.product.findUnique({ where: { id: topWon[0] } })) : null;
  const manage = can.manageProducts(user);
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

  return (
    <>
      <PageHeader
        title="Products"
        description="The catalogue every deal line item is built from. Classification and tax codes flow through to billing."
        actions={manage && <ProductDialog bus={options.bus} categories={options.categories} oems={options.oems} />}
      >
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Suspense><SearchBox placeholder="Search SKU, name, OEM, HSN/SAC" /></Suspense>
          <Pills param="bu" sp={sp} path="/products" allLabel="All BUs" options={options.bus.map((b) => ({ value: b.id, label: b.name }))} />
          <Pills param="type" sp={sp} path="/products" allLabel="All types" options={Object.entries(PRODUCT_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
          {manage && <Pills param="status" sp={sp} path="/products" allLabel="Active" options={[{ value: "inactive", label: "Inactive" }, { value: "all", label: "All" }]} />}
        </div>
      </PageHeader>
      <PageBody className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile label="Active products" value={totalActive} sub={`${oemCount} OEMs in this view`} accent="var(--s1)" />
          <StatTile label="Used on deals" value={use.size} sub="Distinct products quoted" accent="var(--s3)" />
          <StatTile label="Won through catalogue" value={inr([...use.values()].reduce((a, x) => a + x.won, 0))} sub="Closed-won line value" accent="var(--s6)" />
          <StatTile label="Top product by bookings" value={<span className="text-[15px]">{topProduct?.name ?? "—"}</span>} sub={topWon ? inr(topWon[1].won) : undefined} />
        </div>
        <div className="rounded-xl border border-border bg-surface">
          {products.length === 0 ? (
            <EmptyState icon={Package} title="No products match" description={manage ? "Add a product or clear the filters." : "Ask an administrator to add it."} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Product</TH><TH>OEM</TH><TH>BU / Category</TH><TH>Billing</TH><TH>HSN/SAC</TH>
                  <TH className="text-right">List price</TH><TH className="text-right">Std. margin</TH><TH className="text-right">Open pipeline</TH><TH className="text-right">Won</TH>
                  {manage && <TH />}
                </tr>
              </THead>
              <TBody>
                {products.map((p) => {
                  const u = use.get(p.id);
                  const list = p.listPrice ? toNumber(p.listPrice) : null;
                  const cost = p.standardCost ? toNumber(p.standardCost) : null;
                  return (
                    <TR key={p.id} className={p.active ? "" : "opacity-55"}>
                      <TD className="min-w-[300px]">
                        <p className="font-medium">{p.name.replace(`${p.oem.name} `, "")}</p>
                        <p className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-3">
                          <span className="font-mono">{p.code}</span>
                          <Badge tone={TYPE_TONE[p.productType]}>{PRODUCT_TYPE_LABEL[p.productType]}</Badge>
                          {!p.active && <span>inactive</span>}
                        </p>
                      </TD>
                      <TD>{p.oem.name}</TD>
                      <TD className="text-xs"><span className="block">{p.businessUnit.name}</span><span className="text-ink-3">{p.category.name}</span></TD>
                      <TD className="text-xs">{BILLING_FREQUENCY_LABEL[p.billingFrequency]}{p.defaultTermMonths ? ` · ${p.defaultTermMonths} mo` : ""}</TD>
                      <TD className="font-mono text-xs">{p.hsnSac} <span className="text-ink-3">· {toNumber(p.gstRatePct)}%</span></TD>
                      <TD className="text-right tabular">{list === null ? "—" : inr(list)}<span className="text-[11px] text-ink-3">{p.billingFrequency !== "ONE_TIME" && list ? ` /${p.billingFrequency === "MONTHLY" ? "mo" : p.billingFrequency === "QUARTERLY" ? "qtr" : "yr"}` : ""}</span></TD>
                      <TD className="text-right tabular text-ink-2">{list && cost !== null ? pct(((list - cost) / list) * 100, 0) : "—"}</TD>
                      <TD className="text-right tabular">{u?.open ? inr(u.open) : <span className="text-ink-3">—</span>}</TD>
                      <TD className="text-right tabular">{u?.won ? inr(u.won) : <span className="text-ink-3">—</span>}</TD>
                      {manage && (
                        <TD className="text-right whitespace-nowrap">
                          <ProductDialog
                            id={p.id} bus={options.bus} categories={options.categories} oems={options.oems}
                            initial={{
                              code: p.code, name: p.name, description: s(p.description), businessUnitId: p.businessUnitId, categoryId: p.categoryId,
                              oemId: p.oemId, productType: p.productType, unit: p.unit, billingFrequency: p.billingFrequency,
                              defaultTermMonths: s(p.defaultTermMonths), listPrice: list === null ? "" : String(list), standardCost: cost === null ? "" : String(cost),
                              hsnSac: p.hsnSac, gstRatePct: String(toNumber(p.gstRatePct)), active: String(p.active),
                            }}
                          />
                          <ToggleProductButton id={p.id} active={p.active} />
                        </TD>
                      )}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </div>
      </PageBody>
    </>
  );
}
