// What a deal needs at creation, and which fields depend on which. Shared by the deal form (to show and filter
// fields) and the server (to derive the rest), so both apply the same rules.

export type AccountTypeKey = "NEW_LOGO" | "EXISTING";
export type DealTypeKey = "NEW_BUSINESS" | "UPSELL" | "CROSS_SELL" | "RENEWAL";

/** A new logo is always new business; an existing customer buys more (upsell), something else (cross-sell) or renews. */
export function dealTypesFor(accountType: AccountTypeKey): DealTypeKey[] {
  return accountType === "NEW_LOGO" ? ["NEW_BUSINESS"] : ["UPSELL", "CROSS_SELL", "RENEWAL"];
}

export function dealTypeFor(accountType: AccountTypeKey, chosen?: string | null): DealTypeKey {
  const allowed = dealTypesFor(accountType);
  return allowed.includes(chosen as DealTypeKey) ? (chosen as DealTypeKey) : allowed[0]!;
}

/**
 * Whether the deal needs presales: yes when any line is in a solution category (servers, networking, cloud,
 * services, SOC), which need design and sizing; no for resale items (laptops, licences), which sales can quote from
 * the catalogue. Sales can override the suggestion.
 */
export function suggestPresales(categoryIds: string[], categories: { id: string; needsPresales: boolean }[]): boolean {
  const byId = new Map(categories.map((c) => [c.id, c.needsPresales]));
  return categoryIds.some((id) => byId.get(id));
}

/** RFPs and tenders have a hard bid submission date. */
export const needsBidDate = (procurementMode: string) => procurementMode === "RFP" || procurementMode === "TENDER";

/** OEMs on the deal that run deal registration: when there are none, deal registration is not asked for. */
export function dealRegOems(oemIds: string[], oems: { id: string; name: string; dealRegistration?: boolean }[]) {
  const ids = new Set(oemIds);
  return oems.filter((o) => ids.has(o.id) && o.dealRegistration);
}

/** Deliverables sales can ask presales for. A site survey also asks for the sites. */
export const PRESALES_DELIVERABLES = [
  { key: "BOQ", label: "BOQ" },
  { key: "SOLUTION_DOC", label: "Solution document" },
  { key: "PRESENTATION", label: "Customer presentation" },
  { key: "SITE_SURVEY", label: "Site survey" },
  { key: "POC", label: "PoC / demo" },
] as const;
/** Deliverables that are documents: when sales asks for one, presales attaches it before submitting the BOQ */
export const DOC_DELIVERABLES = ["SOLUTION_DOC", "PRESENTATION", "SITE_SURVEY"];

export const DELIVERABLE_LABEL: Record<string, string> = Object.fromEntries(PRESALES_DELIVERABLES.map((d) => [d.key, d.label]));

/** A line on the New opportunity form, as far as checking it goes */
export type DraftCheck = {
  kind: "product" | "estimate";
  productId?: string;
  buId?: string;
  categoryId?: string;
  oemId?: string;
  value?: number | null;
  unitPrice?: number | null;
};

/**
 * What is missing on each line of the New opportunity form, keyed "lines.<n>.<field>" with n the line's place on the
 * form. The value of an estimate may be left blank (not known yet): it is needed before the deal is qualified.
 */
export function draftLineErrors(lines: DraftCheck[], formIndex: number[] = lines.map((_, i) => i)): Record<string, string> {
  const out: Record<string, string> = {};
  lines.forEach((l, j) => {
    const at = (field: string, msg: string) => (out[`lines.${formIndex[j]}.${field}`] = msg);
    if (l.kind === "product") {
      if (!l.productId) at("productId", "Pick a product");
      if ((l.unitPrice ?? 0) < 0) at("unitPrice", "The price can't be negative");
      return;
    }
    // One step at a time: the OEM list opens once the category is chosen, so it isn't asked for before
    if (!l.buId) at("buId", "Choose a business unit");
    else if (!l.categoryId) at("categoryId", "Choose a category");
    else if (!l.oemId) at("oemId", "Choose an OEM, or To be decided");
    if ((l.value ?? 0) < 0) at("value", "The value can't be negative");
    else if ((l.value ?? 0) > 1e11) at("value", "That value is too large");
  });
  return out;
}

/** Billing a category usually has: recurring when most of its catalogue products bill monthly, quarterly or yearly. */
export function typicalBilling(categoryId: string, products: { categoryId: string; billingFrequency: string }[]): "RECURRING" | "ONE_TIME" {
  const inCat = products.filter((p) => p.categoryId === categoryId);
  const recurring = inCat.filter((p) => p.billingFrequency !== "ONE_TIME").length;
  return inCat.length > 0 && recurring * 2 > inCat.length ? "RECURRING" : "ONE_TIME";
}

/**
 * Deal type, worked out instead of asked: a new logo is new business. For an existing customer, buying again in a
 * category they already bought (a won deal) is a renewal when it recurs and an upsell otherwise; a category they
 * never bought is a cross-sell. Sales can correct it on the edit form.
 */
export function autoDealType(
  accountType: AccountTypeKey,
  boughtCategoryIds: string[],
  lines: { categoryId: string; recurring: boolean }[],
): DealTypeKey {
  if (accountType === "NEW_LOGO") return "NEW_BUSINESS";
  const bought = new Set(boughtCategoryIds);
  const again = lines.filter((l) => bought.has(l.categoryId));
  if (!again.length) return "CROSS_SELL";
  return again.some((l) => l.recurring) ? "RENEWAL" : "UPSELL";
}
