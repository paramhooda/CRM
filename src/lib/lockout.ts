// Sign-in lockout rules (pure, unit-tested). Attempts are stored in the LoginAttempt table, so limits survive
// restarts and apply however many app processes run.

export const LOCKOUT = {
  /** Wrong passwords on one account within the window before it locks */
  maxFailures: 10,
  windowMs: 15 * 60_000,
  lockMs: 15 * 60_000,
  /** Wrong passwords from one network address (any accounts) within the window; only when TRUST_PROXY=true */
  maxFailuresPerIp: 30,
  keepDays: 30,
};

export function isLocked(lockedUntil: Date | null | undefined, now: Date) {
  return !!lockedUntil && lockedUntil.getTime() > now.getTime();
}

/** After a wrong password: lock until when, or null to stay open. `failures` includes the one just made. */
export function lockAfterFailure(failures: number, now: Date): Date | null {
  return failures >= LOCKOUT.maxFailures ? new Date(now.getTime() + LOCKOUT.lockMs) : null;
}

export function lockedMessage(until: Date) {
  const mins = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  return `This account is locked after too many wrong passwords. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or ask an administrator to unlock it.`;
}

/** Only follow `next` to a path on this site: "/x" yes; "//evil.com", "/\\evil.com" and "https://…" no. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
  return next && /^\/(?![/\\])/.test(next) && !/[\r\n]/.test(next) ? next : fallback;
}
