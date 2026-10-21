// Authorization: record visibility (who sees which opportunities/accounts) and action permissions.
// Model follows a private sharing model with role hierarchy: Sales see their own book, Presales/Purchase see
// deals they are working on, Sales Head and Admin see everything.
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
      return { ...base, OR: [{ presalesOwnerId: u.id }, { presalesRequests: { some: { assignedToId: u.id } } }] };
    case "PURCHASE":
      return { ...base, OR: [{ purchaseOwnerId: u.id }, { pricingRequests: { some: { assignedToId: u.id } } }] };
  }
}

export function accountScope(u: U): Prisma.AccountWhereInput {
  const base: Prisma.AccountWhereInput = { deletedAt: null };
  if (isManager(u)) return base;
  if (u.role === "SALES") {
    return { ...base, OR: [{ ownerId: u.id }, { opportunities: { some: { salesOwnerId: u.id, deletedAt: null } } }] };
  }
  return { ...base, opportunities: { some: opportunityScope(u) } };
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
  /** Cost side: unit cost, distributor, OEM quote ref, lead time */
  editBoqCost: (u: U) => u.role === "ADMIN" || u.role === "PURCHASE",
  /** Sell side: unit price */
  editBoqPrice: (u: U, o: OppRef) => isManager(u) || (u.role === "SALES" && o.salesOwnerId === u.id),
  /** Field-level security: presales do not see buy prices or margin */
  viewCost: (u: U) => u.role !== "PRESALES",
  createQuote: (u: U, o: OppRef) => isManager(u) || (u.role === "SALES" && o.salesOwnerId === u.id),
  manageAccounts: (u: U) => u.role === "ADMIN" || u.role === "SALES_HEAD" || u.role === "SALES",
  manageLeads: (u: U) => u.role === "ADMIN" || u.role === "SALES_HEAD" || u.role === "SALES",
  logActivity: () => true,
  reviewPipeline: (u: U) => isManager(u) || u.role === "SALES",
  admin: (u: U) => u.role === "ADMIN",
  manageTargets: (u: U) => isManager(u),
  deleteRecords: (u: U) => isManager(u),
};
