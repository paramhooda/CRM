import { z } from "zod";
import { nonNegativeMoney, optionalText, optionalUuid, trimmed, uuid } from "./common";

export const approvalRuleSchema = z
  .object({
    name: trimmed(120, 3),
    isActive: z.boolean().default(true),
    gmBelowPct: z.union([z.number(), z.string()]).transform(String).pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter a percentage.")).nullable().optional(),
    dealValueAtLeast: nonNegativeMoney.nullable().optional(),
    businessUnitId: optionalUuid,
    steps: z
      .array(
        z.object({
          approverKind: z.enum(["OWNER_MANAGER", "ROLE", "USER"]),
          approverRole: z.enum(["ADMIN", "SALES_HEAD"]).nullable().optional(),
          approverUserId: uuid.nullable().optional(),
        }),
      )
      .min(1, "Add at least one approver.")
      .max(6),
  })
  .refine((r) => r.gmBelowPct || r.dealValueAtLeast || r.businessUnitId, { message: "Set at least one condition.", path: ["gmBelowPct"] })
  .refine((r) => r.steps.every((s) => (s.approverKind === "ROLE" ? !!s.approverRole : s.approverKind === "USER" ? !!s.approverUserId : true)), { message: "Each approver needs a role or a person.", path: ["steps"] });
export type ApprovalRuleInput = z.infer<typeof approvalRuleSchema>;

export const decideSchema = z
  .object({ decision: z.enum(["APPROVED", "REJECTED"]), note: optionalText(1000) })
  .refine((d) => d.decision === "APPROVED" || !!d.note, { message: "Say why it is rejected.", path: ["note"] });

export const documentUploadFields = z.object({ documentKindId: uuid, description: optionalText(300) });
