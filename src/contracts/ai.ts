import { z } from "zod";

/** What the assistant can draft on a deal: a presales scope, a BOQ summary, or a plain-English brief. */
export const AI_DRAFT_KINDS = ["scope", "boq_summary", "brief"] as const;
export const aiDraftSchema = z.object({ kind: z.enum(AI_DRAFT_KINDS) });
export type AiDraftKind = (typeof AI_DRAFT_KINDS)[number];
