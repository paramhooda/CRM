import { z } from "zod";
import { handle } from "@/server/http";
import { NotFound } from "@/server/errors";
import { SETTING_KEYS, type SettingKey } from "@/contracts/settings";
import { publicSetting, putSetting } from "@/server/services/settings";

const keyOf = (k: string | undefined): SettingKey => {
  if (!k || !(SETTING_KEYS as readonly string[]).includes(k)) throw new NotFound();
  return k as SettingKey;
};

export const GET = handle({ roles: ["ADMIN"], fn: ({ actor, params }) => publicSetting(actor, keyOf(params.key)) });
export const PUT = handle({ roles: ["ADMIN"], body: z.record(z.string(), z.unknown()), fn: ({ actor, params, body, requestId }) => putSetting(actor, keyOf(params.key), body, requestId) });
