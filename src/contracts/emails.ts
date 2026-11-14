import { z } from "zod";
import { email, trimmed, uuid } from "./common";

/** An email to the customer from the deal page, with deal documents attached. */
export const sendDealEmailSchema = z.object({
  to: z.array(email).min(1, "Add at least one recipient.").max(20),
  cc: z.array(email).max(20).default([]),
  subject: trimmed(200, 1),
  body: trimmed(10_000, 1),
  documentIds: z.array(uuid).max(10).default([]),
});
export type SendDealEmailInput = z.infer<typeof sendDealEmailSchema>;

/** Send the proposal and move the deal to Proposal Submitted in one go; the version guards the move. */
export const sendProposalSchema = sendDealEmailSchema.extend({ version: z.number().int().min(1) });
export type SendProposalInput = z.infer<typeof sendProposalSchema>;
