import { z } from "zod";
import { optionalText } from "./common";

export const createQuoteSchema = z.object({
  /** Days the quote stays valid from today (30 by default). */
  validityDays: z.number().int().min(1).max(180).default(30),
  /** Printed under the lines: scope, exclusions, delivery. */
  notes: optionalText(2000),
});
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
