import "server-only";
import { cache } from "react";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { ValidationError } from "../errors";
import { recordChanges } from "../audit";
import { assertPermission } from "../authz/scope";
import { fieldErrors } from "../http";
import { SECRET_FIELDS, SETTING_DEFAULTS, SETTING_SCHEMAS, type SettingKey, type SettingValue } from "@/contracts/settings";

type Row = Record<string, unknown>;

/** The audit log keys entities by UUID; a setting's id is a stable UUID derived from its name. */
export function settingEntityId(key: SettingKey): string {
  const h = createHash("sha1").update(`progression-crm:setting:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** The stored value merged over the defaults, including secrets. Server-side use only; cached per request. */
export const getSetting = cache(async <K extends SettingKey>(key: K): Promise<SettingValue<K>> => {
  const row = await db.setting.findUnique({ where: { key } });
  const stored = (row?.value ?? {}) as Row;
  return { ...(SETTING_DEFAULTS[key] as Row), ...stored } as SettingValue<K>;
});

/** The value as the admin screen sees it: secrets replaced by a `<field>Set` flag. */
export async function publicSetting<K extends SettingKey>(actor: Actor, key: K) {
  assertPermission(actor, "lookups.manage");
  const value = { ...(await getSetting(key)) } as Row;
  for (const f of SECRET_FIELDS[key] ?? []) {
    value[`${f}Set`] = typeof value[f] === "string" && (value[f] as string).length > 0;
    delete value[f];
  }
  return value;
}

/** Validates against the key's schema and saves. An omitted secret keeps the stored one; an empty string clears it. */
export async function putSetting(actor: Actor, key: SettingKey, input: unknown, requestId: string) {
  assertPermission(actor, "lookups.manage");
  const parsed = SETTING_SCHEMAS[key].safeParse(input);
  if (!parsed.success) throw new ValidationError(undefined, fieldErrors(parsed.error));
  const before = (await getSetting(key)) as Row;
  const next: Row = { ...before, ...(parsed.data as Row) };
  for (const f of SECRET_FIELDS[key] ?? []) {
    if (!(f in (parsed.data as Row))) next[f] = before[f];
    else if (next[f] === "") delete next[f];
  }
  await db.$transaction(async (tx) => {
    await tx.setting.upsert({ where: { key }, create: { key, value: next as Prisma.InputJsonValue, updatedById: actor.id }, update: { value: next as Prisma.InputJsonValue, updatedById: actor.id } });
    const redact = (v: Row) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, (SECRET_FIELDS[key] ?? []).includes(k) ? (x ? "(set)" : null) : typeof x === "object" && x !== null ? JSON.stringify(x) : x]));
    await recordChanges(tx, { entityType: "setting", entityId: settingEntityId(key), userId: actor.id, requestId, before: redact(before), after: redact(next) });
  });
  return publicSetting(actor, key);
}
