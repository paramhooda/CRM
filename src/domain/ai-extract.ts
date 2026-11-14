// What the assistant reads out of a solution document or a vendor quote, and how it is matched to the catalogue and
// the deal's lines. Pure: the service feeds it the model's JSON and the reference lists; the screen shows the result
// for review and nothing is saved until the person presses Save.
import { z } from "zod";

const num = z.union([z.number(), z.string()]).transform((v) => String(v).replace(/[,\s₹]/g, "").trim());

/** The model's answer for a BOQ document. Names are free text; the matcher turns them into ids. */
export const boqExtractSchema = z.object({
  lines: z.array(z.object({
    description: z.string().trim().min(1).max(300),
    productCode: z.string().trim().max(40).nullable().optional(),
    oem: z.string().trim().max(80).nullable().optional(),
    businessUnit: z.string().trim().max(80).nullable().optional(),
    subBusinessUnit: z.string().trim().max(80).nullable().optional(),
    quantity: num.optional(),
    unit: z.string().trim().max(20).nullable().optional(),
    recurring: z.boolean().nullable().optional(),
    termMonths: z.number().int().min(1).max(120).nullable().optional(),
    unitPurchaseCost: num.nullable().optional(),
  })).max(60),
  notes: z.string().max(1000).nullable().optional(),
});

/** The model's answer for vendor quotes: a cost per deal line, by line number or by description. */
export const priceExtractSchema = z.object({
  costs: z.array(z.object({
    lineNo: z.number().int().min(1).nullable().optional(),
    description: z.string().trim().max(300).nullable().optional(),
    unitPurchaseCost: num,
    vendor: z.string().trim().max(120).nullable().optional(),
    note: z.string().trim().max(300).nullable().optional(),
  })).max(100),
  notes: z.string().max(1000).nullable().optional(),
});

export type CatalogueRef = { products: { id: string; code: string; name: string; unit: string; revenueModel: "ONE_TIME" | "ARR"; defaultTermMonths: number | null; businessUnitId: string; subBusinessUnitId: string; oemId: string }[]; businessUnits: { id: string; name: string }[]; subBusinessUnits: { id: string; name: string; businessUnitId: string }[]; oems: { id: string; name: string; isOwnIp: boolean }[] };

export type ExtractedLine = {
  description: string; productId: string | null; productLabel: string | null; businessUnitId: string | null; subBusinessUnitId: string | null; oemId: string | null;
  quantity: string; unit: string; revenueModel: "ONE_TIME" | "ARR"; termMonths: string; unitPurchaseCost: string;
  /** What still needs a human: an unmatched OEM, business unit or Sub BU, a bad quantity */
  issues: string[];
};

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const MONEY = /^\d+(\.\d{1,2})?$/;

function findByName<T extends { name: string }>(list: T[], name: string | null | undefined): T | undefined {
  const n = norm(name);
  if (!n) return undefined;
  return list.find((x) => norm(x.name) === n) ?? list.find((x) => norm(x.name).includes(n) || n.includes(norm(x.name)));
}

/** Turns the model's lines into grid drafts: catalogue code or name first, then OEM / BU / Sub BU by name, with issues named. */
export function matchBoqLines(raw: z.infer<typeof boqExtractSchema>, ref: CatalogueRef): ExtractedLine[] {
  return raw.lines.map((l) => {
    const issues: string[] = [];
    const byCode = l.productCode ? ref.products.find((p) => norm(p.code) === norm(l.productCode)) : undefined;
    const byName = byCode ?? ref.products.find((p) => norm(p.name) === norm(l.description)) ?? ref.products.find((p) => norm(l.description).includes(norm(p.name)) && norm(p.name).length > 8);
    const product = byName ?? null;
    let oem = product ? ref.oems.find((o) => o.id === product.oemId) : findByName(ref.oems, l.oem);
    let bu = product ? ref.businessUnits.find((b) => b.id === product.businessUnitId) : findByName(ref.businessUnits, l.businessUnit);
    let sub = product ? ref.subBusinessUnits.find((s) => s.id === product.subBusinessUnitId) : findByName(ref.subBusinessUnits.filter((s) => !bu || s.businessUnitId === bu.id), l.subBusinessUnit);
    if (!bu && sub) bu = ref.businessUnits.find((b) => b.id === sub!.businessUnitId);
    if (sub && bu && sub.businessUnitId !== bu.id) sub = undefined;
    if (!oem) { issues.push(l.oem ? `OEM "${l.oem}" is not in the list` : "Pick the OEM"); oem = undefined; }
    if (!bu) issues.push(l.businessUnit ? `Business unit "${l.businessUnit}" is not in the list` : "Pick the business unit");
    if (!sub) issues.push(l.subBusinessUnit ? `Sub BU "${l.subBusinessUnit}" is not in the list` : "Pick the Sub BU");
    const qty = l.quantity && /^\d+(\.\d+)?$/.test(l.quantity) && Number(l.quantity) > 0 ? l.quantity : "1";
    if (qty !== (l.quantity ?? "1")) issues.push("Quantity read as 1; check it");
    const recurring = l.recurring ?? (product ? product.revenueModel === "ARR" : false);
    const term = recurring ? String(l.termMonths ?? product?.defaultTermMonths ?? 12) : "";
    const cost = l.unitPurchaseCost && MONEY.test(l.unitPurchaseCost) ? l.unitPurchaseCost : "";
    return {
      description: l.description, productId: product?.id ?? null, productLabel: product?.name ?? null,
      businessUnitId: bu?.id ?? null, subBusinessUnitId: sub?.id ?? null, oemId: oem?.id ?? null,
      quantity: qty, unit: l.unit || product?.unit || "Nos", revenueModel: recurring ? "ARR" : "ONE_TIME", termMonths: term,
      unitPurchaseCost: oem?.isOwnIp ? cost : "",
      issues,
    };
  });
}

export type ExtractedCost = { lineId: string; lineNo: number; unitPurchaseCost: string; vendor: string | null; note: string | null };

/** Matches quoted costs to the deal's lines by line number, else by description; the lowest quote wins when several vendors price one line. */
export function matchPrices(raw: z.infer<typeof priceExtractSchema>, lines: { id: string; lineNo: number; description: string }[]): { costs: ExtractedCost[]; unmatched: string[] } {
  const best = new Map<string, ExtractedCost>();
  const unmatched: string[] = [];
  for (const c of raw.costs) {
    if (!MONEY.test(c.unitPurchaseCost) || Number(c.unitPurchaseCost) <= 0) { unmatched.push(`${c.description ?? `line ${c.lineNo ?? "?"}`}: cost "${c.unitPurchaseCost}" is not an amount`); continue; }
    const line = (c.lineNo ? lines.find((l) => l.lineNo === c.lineNo) : undefined) ?? (c.description ? lines.find((l) => norm(l.description) === norm(c.description)) ?? lines.find((l) => norm(l.description).includes(norm(c.description)) || norm(c.description!).includes(norm(l.description))) : undefined);
    if (!line) { unmatched.push(`${c.description ?? `line ${c.lineNo}`}${c.vendor ? ` (${c.vendor})` : ""}: no matching line on the deal`); continue; }
    const cur = best.get(line.id);
    if (!cur || Number(c.unitPurchaseCost) < Number(cur.unitPurchaseCost)) best.set(line.id, { lineId: line.id, lineNo: line.lineNo, unitPurchaseCost: c.unitPurchaseCost, vendor: c.vendor ?? null, note: c.note ?? null });
  }
  return { costs: [...best.values()].sort((a, b) => a.lineNo - b.lineNo), unmatched };
}

/** The instructions the model gets, with the reference lists so it answers in the CRM's own names. */
export function extractPrompt(kind: "boq" | "prices", ref: { products: { code: string; name: string; oem: string; subBusinessUnit: string; unit: string }[]; oems: string[]; businessUnits: { name: string; subs: string[] }[]; lines?: { lineNo: number; description: string; quantity: string; unit: string }[] }): string {
  const catalogue = ref.products.slice(0, 400).map((p) => `${p.code} | ${p.name} | ${p.oem} | ${p.subBusinessUnit} | ${p.unit}`).join("\n");
  const bus = ref.businessUnits.map((b) => `${b.name}: ${b.subs.join(", ")}`).join("\n");
  if (kind === "boq") {
    return `You read a solution document, bill of quantities, spreadsheet or email for an IT systems integrator and return the sellable line items as JSON: {"lines":[{"description","productCode","oem","businessUnit","subBusinessUnit","quantity","unit","recurring","termMonths","unitPurchaseCost"}],"notes"}.
Rules: one entry per item the customer buys (hardware, software, licences, services, subscriptions); skip headings, totals, taxes and terms. Use "productCode" only when the item clearly is that catalogue product, else null. Choose "oem", "businessUnit" and "subBusinessUnit" from the lists below (exact names) or null. "quantity" is a number; "unit" like Nos, Users, Devices, Days, Months; "recurring" true for subscriptions and annual services with "termMonths"; "unitPurchaseCost" only if the document states a unit cost, else null. Never invent items. Put anything doubtful in "notes".
Catalogue (code | name | OEM | Sub BU | unit):\n${catalogue}\nOEMs: ${ref.oems.join(", ")}\nBusiness units and their Sub BUs:\n${bus}`;
  }
  const lines = (ref.lines ?? []).map((l) => `${l.lineNo} | ${l.description} | ${l.quantity} ${l.unit}`).join("\n");
  return `You read vendor or distributor quotations (PDF, image, spreadsheet or email) for an IT systems integrator and return the unit purchase cost offered for each line of the deal as JSON: {"costs":[{"lineNo","description","unitPurchaseCost","vendor","note"}],"notes"}.
Rules: "unitPurchaseCost" is the price per unit in INR before GST, as a number without symbols; convert a total to a unit cost by dividing by the quoted quantity when needed; one entry per vendor per line (the CRM keeps the lowest). Match to the deal lines below by "lineNo" when the item is clearly the same, else give the quoted "description" and leave lineNo null. Put the vendor's name in "vendor" and validity or conditions in "note". Never invent prices. Put anything doubtful in "notes".
Deal lines (no | description | quantity):\n${lines}`;
}
