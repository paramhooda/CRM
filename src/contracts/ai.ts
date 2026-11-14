import { z } from "zod";

/** What the assistant can draft on a deal: a presales scope, a BOQ summary, a plain-English brief, or the proposal email. */
export const AI_DRAFT_KINDS = ["scope", "boq_summary", "brief", "email"] as const;
export const aiDraftSchema = z.object({ kind: z.enum(AI_DRAFT_KINDS) });
export type AiDraftKind = (typeof AI_DRAFT_KINDS)[number];
