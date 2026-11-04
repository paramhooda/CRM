// Authorization: record visibility (who sees which opportunities/accounts) and action permissions.
// Sales see their own book; Sales Head and Admin see everything. Presales and Purchase work on requests: they see only
// the deals they are (or were) assigned to, and on those only their part (no sell prices, margin, forecast or funnel).
// What each role can change is governed by the `can` rules below (field-level BOQ rights, owner-only deal edits).
import type { Prisma, Role } from "@prisma/client";

type U = { id: string; role: Role };

export const isManager = (u: U) => u.role === "ADMIN" || u.role === "SALES_HEAD";
/** Presales and Purchase: they work on BOQ and pricing requests, not on the sales funnel */
export const isSupportRole = (u: U) => u.role === "PRESALES" || u.role === "PURCHASE";
/** Roles that may see the funnel: pipeline, reviews, reports, accounts, contacts, leads */
export const SALES_ROLES = ["ADMIN", "SALES_HEAD", "SALES"] as const;

export function opportunityScope(u: U): Prisma.OpportunityWhereInput {
  const base: Prisma.OpportunityWhereInput = { deletedAt: null };
  switch (u.role) {
    case "ADMIN":
    case "SALES_HEAD":
      return base;
    case "SALES":
      return { ...base, salesOwnerId: u.id };
    case "PRESALES":
      return { ...base, OR: [{ presalesOwnerId: u.id }, { presalesRequests: { some: { assignedToId: u.id } } }] };
    case "PURCHASE":
      return { ...base, OR: [{ purchaseOwnerId: u.id }, { pricingRequests: { some: { assignedToId: u.id } } }] };
  }
}

export function accountScope(u: U): Prisma.AccountWhereInput {
  const base: Prisma.AccountWhereInput = { deletedAt: null };
  if (isSupportRole(u)) return { ...base, opportunities: { some: opportunityScope(u) } };
  if (u.role !== "SALES") return base;
  return { ...base, OR: [{ ownerId: u.id }, { opportunities: { some: { salesOwnerId: u.id, deletedAt: null } } }] };
}

export function leadScope(u: U): Prisma.LeadWhereInput {
  const base: Prisma.LeadWhereInput = { deletedAt: null };
  if (isManager(u)) return base;
  return { ...base, ownerId: u.id };
}

type OppRef = { salesOwnerId: string; presalesOwnerId: string | null; purchaseOwnerId?: string | null };

export const can = {
  createOpportunity: (u: U) => u.role === "ADMIN" || u.role === "SALES_HEAD" || u.role === "SALES",
  editOpportunity: (u: U, o: OppRef) => isManager(u) || (u.role === "SALES" && o.salesOwnerId === u.id),
  reassignOpportunity: (u: U) => isManager(u),
  requestPresales: (u: U, o: OppRef) => isManager(u) || (u.role === "SALES" && o.salesOwnerId === u.id),
  /** BOQ specification: part numbers, descriptions, quantities */
  editBoqSpec: (u: U, o: OppRef) =>
    isManager(u) || (u.role === "PRESALES" && o.presalesOwnerId === u.id) || (u.role === "SALES" && o.salesOwnerId === u.id),
  /** Cost side of purchase lines: unit cost, supplier validity, distributor, OEM quote ref, lead time */
  editBoqCost: (u: U) => u.role === "ADMIN" || u.role === "PURCHASE",
  /** Internal cost of own-brand lines (presales costing, or reworking the rate card for this deal) */
  editInternalCost: (u: U, o: OppRef) => u.role === "ADMIN" || (u.role === "PRESALES" && (!o.presalesOwnerId || o.presalesOwnerId === u.id)),
  /** Sell side: unit price */
  editBoqPrice: (u: U, o: OppRef) => isManager(u) || (u.role === "SALES" && o.salesOwnerId === u.id),
  /** Everyone involved in a deal may see buy prices; only Purchase/Admin (and presales for own brand) change them. */
  viewCost: (u: U) => !!u,
  /** Sell side and funnel: sell prices, margin, quotes, deal value, forecast, health, activity and audit trail */
  viewSales: (u: U) => !isSupportRole(u),
  /** Product catalogue is governed centrally */
  manageProducts: (u: U) => u.role === "ADMIN",
  createQuote: (u: U, o: OppRef) => isManager(u) || (u.role === "SALES" && o.salesOwnerId === u.id),
  manageAccounts: (u: U) => u.role === "ADMIN" || u.role === "SALES_HEAD" || u.role === "SALES",
  manageLeads: (u: U) => u.role === "ADMIN" || u.role === "SALES_HEAD" || u.role === "SALES",
  logActivity: () => true,
  reviewPipeline: (u: U) => isManager(u) || u.role === "SALES",
  /** Add a document to a deal: the sales side always; presales and purchase while the deal is open */
  addDocument: (u: U, o: OppRef & { closed: boolean }) =>
    isManager(u) || (u.role === "SALES" && o.salesOwnerId === u.id) || (isSupportRole(u) && !o.closed),
  admin: (u: U) => u.role === "ADMIN",
  manageTargets: (u: U) => isManager(u),
  deleteRecords: (u: U) => isManager(u),
};
