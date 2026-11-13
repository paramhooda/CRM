import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
  password: z.string().min(1, "Enter your password.").max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(200),
    newPassword: z.string().min(10, "At least 10 characters, with a letter and a number.").max(72),
  })
  .refine((v) => v.currentPassword !== v.newPassword, { message: "Choose a different password.", path: ["newPassword"] });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
