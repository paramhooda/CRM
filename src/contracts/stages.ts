import { z } from "zod";
import { isoDate, optionalText, trimmed, uuid } from "./common";

export const STAGE_ACTIONS = ["ADVANCE", "SKIP_BOQ", "HOLD", "RESUME", "BACK", "WON", "LOST", "DROPPED", "REOPEN"] as const;

export const stageMoveSchema = z.object({
  action: z.enum(STAGE_ACTIONS),
  version: z.number().int().min(1),
  reason: optionalText(500),
  lossReasonId: uuid.nullable().optional(),
  lossNotes: optionalText(1000),
  poNumber: optionalText(60),
  presalesAssigneeId: uuid.nullable().optional(),
  presalesDueDate: isoDate.nullable().optional(),
  presalesScope: optionalText(2000),
});
export type StageMoveInput = z.infer<typeof stageMoveSchema>;

export const presalesRequestSchema = z.object({
  assignedToId: uuid,
  dueDate: isoDate,
  scope: trimmed(2000, 3),
});
export const pricingRequestSchema = z.object({
  assignedToId: uuid,
  dueDate: isoDate,
  notes: optionalText(2000),
});

export const requestActionSchema = z.object({
  action: z.enum(["START", "SUBMIT", "COMPLETE", "CANCEL", "REASSIGN"]),
  summary: optionalText(2000),
  completionNotes: optionalText(2000),
  assignedToId: uuid.optional(),
  dueDate: isoDate.optional(),
});
export type RequestActionInput = z.infer<typeof requestActionSchema>;

export const requestListQuery = z.object({
  status: z.string().max(40).optional(),
  mine: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
  deal_id: uuid.optional(),
});
