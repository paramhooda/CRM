import "server-only";
import type { Actor } from "../auth/actor";
import { STRIPPED_DEAL_FIELDS, STRIPPED_LINE_FIELDS, isSupportRole, stripFields } from "@/domain/scope";

/** Presales and purchase get the technical side of a deal only: no sales prices, values, margin or forecast. */
export function shapeDeal<T extends object>(actor: Actor, deal: T): T {
  if (!isSupportRole(actor.role)) return deal;
  const d = stripFields(deal, STRIPPED_DEAL_FIELDS) as T & { lines?: object[] };
  if (Array.isArray(d.lines)) d.lines = d.lines.map((l) => stripFields(l, STRIPPED_LINE_FIELDS));
  return d;
}

export function shapeLines<T extends object>(actor: Actor, lines: T[]): T[] {
  return isSupportRole(actor.role) ? lines.map((l) => stripFields(l, STRIPPED_LINE_FIELDS)) : lines;
}

/** Fields of a deal's history a support role may not see. */
export const SALES_ONLY_AUDIT_FIELDS = new Set(["dealValue", "oneTimeValue", "annualRecurringValue", "expectedGmPct", "forecastCategory", "unitSalesPrice", "lineValue", "annualValue", "salesMethodId", "totalCost"]);
