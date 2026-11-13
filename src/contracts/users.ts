import { z } from "zod";
import { email, optionalText, optionalUuid, trimmed } from "./common";

export const ROLES = ["ADMIN", "SALES_HEAD", "SALES", "PRESALES", "PURCHASE"] as const;
export const roleSchema = z.enum(ROLES);

export const ROLE_LABEL: Record<(typeof ROLES)[number], string> = {
  ADMIN: "Admin",
  SALES_HEAD: "Sales Head",
  SALES: "Sales",
  PRESALES: "Presales",
  PURCHASE: "Purchase",
};

export const createUserSchema = z.object({
  fullName: trimmed(120, 2),
  email,
  role: roleSchema,
  managerId: optionalUuid,
  title: optionalText(120),
  temporaryPassword: z.string().min(10, "At least 10 characters, with a letter and a number.").max(72),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  fullName: trimmed(120, 2).optional(),
  role: roleSchema.optional(),
  managerId: optionalUuid,
  title: optionalText(120),
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({ temporaryPassword: z.string().min(10).max(72) });

export const targetRowsSchema = z.object({
  rows: z
    .array(
      z.object({
        userId: z.string().uuid(),
        fiscalYear: z.number().int().min(2020).max(2100),
        quarter: z.number().int().min(1).max(4),
        targetValue: z.union([z.number(), z.string()]).transform(String).pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter an amount.")),
      }),
    )
    .min(1)
    .max(500),
});
