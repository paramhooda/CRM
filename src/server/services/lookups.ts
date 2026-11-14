import "server-only";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { Conflict, NotFound, ValidationError } from "../errors";
import { recordChanges, recordEvent } from "../audit";
import { assertPermission } from "../authz/scope";
import { LOOKUP_TYPES, type LookupType } from "@/contracts/lookups";
import { STAGE_META, ALL_STAGES } from "@/domain/stages";
import { ROLE_LABEL } from "@/contracts/users";

export const FORECASTS = [
  { key: "COMMIT", label: "Commit" },
  { key: "UPSIDE", label: "Upside" },
  { key: "PIPELINE", label: "Pipeline" },
] as const;

/** Everything a form or filter bar needs, in one call. Only active values. */
export async function allLookups() {
  const [businessUnits, subBusinessUnits, oems, leadSources, segments, industries, lossReasons, documentKinds, salesMethods] = await Promise.all([
    db.businessUnit.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, code: true, colourToken: true } }),
    db.subBusinessUnit.findMany({ where: { isActive: true }, orderBy: [{ businessUnit: { sortOrder: "asc" } }, { sortOrder: "asc" }], select: { id: true, name: true, businessUnitId: true, needsPresales: true } }),
    db.oem.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, isOwnIp: true } }),
    db.leadSource.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.segment.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.industry.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.lossReason.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, appliesTo: true } }),
    db.documentKind.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, restrictedToSales: true, requiredAtWon: true } }),
    db.salesMethod.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  return {
    businessUnits, subBusinessUnits, oems, leadSources, segments, industries, lossReasons, documentKinds, salesMethods,
    stages: ALL_STAGES.map((key) => ({ key, ...STAGE_META[key] })),
    forecasts: FORECASTS,
    roles: Object.entries(ROLE_LABEL).map(([key, label]) => ({ key, label })),
  };
}
export type Lookups = Awaited<ReturnType<typeof allLookups>>;

type Delegate = {
  findMany: (args: { where?: object; orderBy?: object }) => Promise<Record<string, unknown>[]>;
  findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
  findFirst: (args: { where: object }) => Promise<Record<string, unknown> | null>;
  create: (args: { data: object }) => Promise<Record<string, unknown>>;
  update: (args: { where: { id: string }; data: object }) => Promise<Record<string, unknown>>;
};

function delegate(type: LookupType): Delegate {
  const map: Record<LookupType, unknown> = {
    "business-units": db.businessUnit,
    "sub-business-units": db.subBusinessUnit,
    oems: db.oem,
    "lead-sources": db.leadSource,
    segments: db.segment,
    industries: db.industry,
    "loss-reasons": db.lossReason,
    "document-kinds": db.documentKind,
    "sales-methods": db.salesMethod,
  };
  return map[type] as Delegate;
}

export function assertLookupType(type: string): LookupType {
  if (!(LOOKUP_TYPES as readonly string[]).includes(type)) throw new NotFound("Unknown lookup.");
  return type as LookupType;
}

export async function listLookup(actor: Actor, type: LookupType, includeInactive: boolean) {
  assertPermission(actor, "lookups.manage");
  const rows = await delegate(type).findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: { sortOrder: "asc" } });
  return { rows };
}

export async function createLookup(actor: Actor, type: LookupType, data: Record<string, unknown>, requestId: string) {
  assertPermission(actor, "lookups.manage");
  await assertRefs(type, data);
  const dup = await delegate(type).findFirst({ where: type === "sub-business-units" ? { businessUnitId: data.businessUnitId, name: data.name } : { name: data.name } });
  if (dup) throw new Conflict("That name is already in the list.", "DUPLICATE");
  const row = await delegate(type).create({ data });
  await recordEvent(db, { entityType: `lookup:${type}`, entityId: row.id as string, action: "CREATE", userId: actor.id, requestId, newValue: data.name });
  return row;
}

export async function updateLookup(actor: Actor, type: LookupType, id: string, data: Record<string, unknown>, requestId: string) {
  assertPermission(actor, "lookups.manage");
  const before = await delegate(type).findUnique({ where: { id } });
  if (!before) throw new NotFound();
  await assertRefs(type, data);
  if (data.name && data.name !== before.name) {
    const dup = await delegate(type).findFirst({ where: type === "sub-business-units" ? { businessUnitId: data.businessUnitId ?? before.businessUnitId, name: data.name } : { name: data.name } });
    if (dup) throw new Conflict("That name is already in the list.", "DUPLICATE");
  }
  const after = await delegate(type).update({ where: { id }, data });
  await recordChanges(db, { entityType: `lookup:${type}`, entityId: id, userId: actor.id, requestId, before, after, fields: Object.keys(data) });
  return after;
}

async function assertRefs(type: LookupType, data: Record<string, unknown>) {
  if (type === "sub-business-units" && data.businessUnitId !== undefined) {
    if (typeof data.businessUnitId !== "string" || !(await db.businessUnit.findUnique({ where: { id: data.businessUnitId } })))
      throw new ValidationError("Pick a business unit.", { businessUnitId: "Pick a business unit." });
  }
}
