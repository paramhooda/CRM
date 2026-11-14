// Sign-in protection rules (pure). Ten failures for one email in fifteen minutes lock the account for fifteen
// minutes; thirty failures from one address in fifteen minutes block the address.

export const WINDOW_MINUTES = 15;
export const EMAIL_FAILURE_LIMIT = 10;
export const IP_FAILURE_LIMIT = 30;
export const LOCK_MINUTES = 15;

export function windowStart(now: Date): Date {
  return new Date(now.getTime() - WINDOW_MINUTES * 60_000);
}

/** When the account should be locked until, given the failures in the window (including this one), or null. */
export function lockUntil(failuresInWindow: number, now: Date): Date | null {
  return failuresInWindow >= EMAIL_FAILURE_LIMIT ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null;
}

export function isLocked(lockedUntil: Date | null | undefined, now: Date): boolean {
  return !!lockedUntil && lockedUntil.getTime() > now.getTime();
}

export function ipBlocked(failuresFromIpInWindow: number): boolean {
  return failuresFromIpInWindow >= IP_FAILURE_LIMIT;
}
