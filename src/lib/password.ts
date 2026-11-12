// Password rules (pure, unit-tested), shared by the admin user form, "Change password" and "Forgot password".

const COMMON = new Set([
  "password1", "password12", "password123", "password@123", "passw0rd", "welcome123", "welcome@123", "admin@123", "admin12345",
  "qwerty1234", "qwerty@123", "abcd@1234", "abc@12345", "india@123", "progression@123", "changeme123", "letmein123",
  "1234567890", "12345678910", "iloveyou123", "monkey12345", "dragon12345",
]);

export const PASSWORD_HINT = "At least 10 characters, with an uppercase letter, a lowercase letter and a number.";

/** Problems with a new password, or [] when it is acceptable. */
export function passwordProblems(pw: string, ctx: { email?: string; name?: string } = {}): string[] {
  const out: string[] = [];
  if (pw.length < 10) out.push("Use at least 10 characters.");
  if (new TextEncoder().encode(pw).length > 72) out.push("Use at most 72 characters.");
  if (!/[A-Z]/.test(pw)) out.push("Include an uppercase letter.");
  if (!/[a-z]/.test(pw)) out.push("Include a lowercase letter.");
  if (!/\d/.test(pw)) out.push("Include a number.");
  const lower = pw.toLowerCase();
  if (COMMON.has(lower)) out.push("This password is too common. Choose another.");
  const local = ctx.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) out.push("Don't use your email name in the password.");
  const first = ctx.name?.split(/\s+/)[0]?.toLowerCase();
  if (first && first.length >= 4 && lower.includes(first)) out.push("Don't use your name in the password.");
  return out;
}

export const BCRYPT_COST = 12;
