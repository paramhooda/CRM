import { describe, expect, it } from "vitest";
import { STRIPPED_LINE_FIELDS, stripFields, teamUserIds, visibleUserIds, type UserRef } from "@/domain/scope";
import { PERMISSIONS, can } from "@/domain/permissions";

const users: UserRef[] = [
  { id: "admin", role: "ADMIN", managerId: null },
  { id: "vivek", role: "SALES_HEAD", managerId: null },
  { id: "anita", role: "SALES_HEAD", managerId: "vivek" },
  { id: "rakesh", role: "SALES", managerId: "vivek" },
  { id: "chirag", role: "SALES", managerId: "anita" },
  { id: "lone", role: "SALES_HEAD", managerId: null },
  { id: "pre", role: "PRESALES", managerId: null },
  { id: "pur", role: "PURCHASE", managerId: null },
];

describe("scope", () => {
  it("a team is everyone reporting up the chain", () => {
    expect(teamUserIds(users, "vivek").sort()).toEqual(["anita", "chirag", "rakesh"]);
    expect(teamUserIds(users, "anita")).toEqual(["chirag"]);
    expect(teamUserIds(users, "rakesh")).toEqual([]);
  });
  it("admin sees all, a sales head their team, a lone sales head every sales person, a rep only themselves", () => {
    expect(visibleUserIds({ id: "admin", role: "ADMIN" }, users)).toBeNull();
    expect(visibleUserIds({ id: "anita", role: "SALES_HEAD" }, users)).toEqual(["anita", "chirag"]);
    expect(visibleUserIds({ id: "lone", role: "SALES_HEAD" }, users)?.sort()).toEqual(["anita", "chirag", "lone", "rakesh", "vivek"]);
    expect(visibleUserIds({ id: "rakesh", role: "SALES" }, users)).toEqual(["rakesh"]);
    expect(visibleUserIds({ id: "pre", role: "PRESALES" }, users)).toEqual([]);
  });
  it("stripping removes the sell side", () => {
    const line = { id: "l", unitSalesPrice: "1", unitPurchaseCost: "2", lineValue: "3", quantity: 1 };
    expect(stripFields(line, STRIPPED_LINE_FIELDS)).toEqual({ id: "l", unitPurchaseCost: "2", quantity: 1 });
  });
});

describe("permissions", () => {
  it("only admins manage users, master data and rules; managers delete and move back; support roles work requests", () => {
    expect(can("ADMIN", "users.manage")).toBe(true);
    expect(can("SALES_HEAD", "users.manage")).toBe(false);
    expect(can("SALES_HEAD", "deals.back")).toBe(true);
    expect(can("SALES", "deals.back")).toBe(true); // the owner has every move on their own deal; scope keeps it to their own
    expect(can("PRESALES", "deals.back")).toBe(false);
    expect(can("PRESALES", "requests.presales.work")).toBe(true);
    expect(can("PURCHASE", "requests.presales.work")).toBe(false);
    expect(can("PRESALES", "home.view")).toBe(false);
    expect(can("PURCHASE", "deals.viewSales")).toBe(false);
  });
  it("every permission names at least one role", () => {
    for (const [p, roles] of Object.entries(PERMISSIONS)) expect(roles.length, p).toBeGreaterThan(0);
  });
});
