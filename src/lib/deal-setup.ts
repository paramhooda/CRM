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
export const DELIVERABLE_LABEL: Record<string, string> = Object.fromEntries(PRESALES_DELIVERABLES.map((d) => [d.key, d.label]));
