// Authorization: record visibility (who sees which opportunities/accounts) and action permissions.
// Sales see their own book. Presales, Purchase, Sales Head and Admin can read everything; what each role can
// change is governed by the `can` rules below (field-level edit rights on the BOQ, owner-only deal edits).
import type { Prisma, Role } from "@prisma/client";

type U = { id: string; role: Role };

export const isManager = (u: U) => u.role === "ADMIN" || u.role === "SALES_HEAD";

export function opportunityScope(u: U): Prisma.OpportunityWhereInput {
  const base: Prisma.OpportunityWhereInput = { deletedAt: null };
  switch (u.role) {
    case "ADMIN":
    case "SALES_HEAD":
      return base;
    case "SALES":
      return { ...base, salesOwnerId: u.id };
    case "PRESALES":
    case "PURCHASE":
      return base;
  }
}

export function accountScope(u: U): Prisma.AccountWhereInput {
  const base: Prisma.AccountWhereInput = { deletedAt: null };
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
  /** Everyone involved in a deal may see buy prices and margin; only Purchase/Admin may change cost. */
  viewCost: (u: U) => !!u,
  /** Product catalogue is governed centrally */
  manageProducts: (u: U) => u.role === "ADMIN",
  createQuote: (u: U, o: OppRef) => isManager(u) || (u.role === "SALES" && o.salesOwnerId === u.id),
  manageAccounts: (u: U) => u.role === "ADMIN" || u.role === "SALES_HEAD" || u.role === "SALES",
  manageLeads: (u: U) => u.role === "ADMIN" || u.role === "SALES_HEAD" || u.role === "SALES",
  logActivity: () => true,
  reviewPipeline: (u: U) => isManager(u) || u.role === "SALES",
  admin: (u: U) => u.role === "ADMIN",
  manageTargets: (u: U) => isManager(u),
  deleteRecords: (u: U) => isManager(u),
};
