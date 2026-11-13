import "server-only";
import bcrypt from "bcryptjs";

const COST = 12;
/** Compared against when the email is unknown, so a wrong email takes as long as a wrong password. */
const DUMMY_HASH = "$2b$12$CwTycUXWue0Thq9StjUM0uJ8u9pCWZ3Z6b1vO0Yl6wqO0vZl9mZx6";

export const PASSWORD_RULE = "At least 10 characters, with a letter and a number.";

export function passwordProblem(pw: string, email?: string): string | null {
  if (pw.length < 10) return PASSWORD_RULE;
  if (pw.length > 72) return "At most 72 characters.";
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return PASSWORD_RULE;
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && pw.toLowerCase().includes(local)) return "The password can't contain your email name.";
  return null;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, COST);
export const verifyPassword = (pw: string, hash: string | null | undefined) => bcrypt.compare(pw, hash ?? DUMMY_HASH);
