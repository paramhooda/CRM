// Role permissions that do not depend on which record is involved. Record-level scope lives in scope.ts and in the
// server's authz layer; this is the matrix of who may do what at all.
import type { Role } from "./scope";

export type Permission =
  | "users.manage"
  | "lookups.manage"
  | "products.manage"
  | "approvalRules.manage"
  | "audit.viewAll"
  | "targets.set"
  | "targets.view"
  | "accounts.write"
  | "accounts.delete"
  | "records.restore"
  | "leads.write"
  | "leads.delete"
  | "deals.create"
  | "deals.write"
  | "deals.delete"
  | "deals.back"
  | "deals.reopen"
  | "deals.viewSales"
  | "requests.presales.work"
  | "requests.pricing.work"
  | "requests.raise"
  | "approvals.request"
  | "approvals.decide"
  | "home.view"
  | "myWork.view"
  | "reviews.view"
  | "reviews.mark"
  | "exports.sales";

const ALL: Role[] = ["ADMIN", "SALES_HEAD", "SALES", "PRESALES", "PURCHASE"];
const MANAGERS: Role[] = ["ADMIN", "SALES_HEAD"];
const SALES: Role[] = ["ADMIN", "SALES_HEAD", "SALES"];
const SUPPORT: Role[] = ["PRESALES", "PURCHASE"];

export const PERMISSIONS: Record<Permission, Role[]> = {
  "users.manage": ["ADMIN"],
  "lookups.manage": ["ADMIN"],
  "products.manage": ["ADMIN"],
  "approvalRules.manage": ["ADMIN"],
  "audit.viewAll": ["ADMIN"],
  "targets.set": MANAGERS,
  "targets.view": SALES,
  "accounts.write": SALES,
  "accounts.delete": MANAGERS,
  "records.restore": ["ADMIN"],
  "leads.write": SALES,
  "leads.delete": MANAGERS,
  "deals.create": SALES,
  "deals.write": SALES,
  "deals.delete": MANAGERS,
  "deals.back": MANAGERS,
  "deals.reopen": MANAGERS,
  "deals.viewSales": SALES,
  "requests.presales.work": ["PRESALES", "ADMIN"],
  "requests.pricing.work": ["PURCHASE", "ADMIN"],
  "requests.raise": [...SALES, "PRESALES"],
  "approvals.request": SALES,
  "approvals.decide": SALES,
  "home.view": SALES,
  "myWork.view": [...SUPPORT, "ADMIN"],
  "reviews.view": SALES,
  "reviews.mark": SALES,
  "exports.sales": SALES,
};

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[permission].includes(role);
}

export const ALL_ROLES = ALL;
