// Turn any failure in a server action into a message a user can act on. Rule violations (UserError) keep their
// own wording; database conditions get plain-language messages; anything unexpected is logged with a short
// reference the user can quote to the administrator.
import "server-only";
import { Prisma } from "@prisma/client";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import type { ActionResult } from "@/lib/validation";
import { zodErrors } from "@/lib/validation";
import { UserError } from "@/server/domain/errors";
import { log, errorFields } from "./log";

export { UserError };

export function errorRef() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** Plain-language message for known database conditions; null when the error is unexpected. */
export function knownErrorMessage(e: unknown): string | null {
  if (e instanceof UserError) return e.message;
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    switch (e.code) {
      case "P2002": return "This already exists. Another record uses the same value.";
      case "P2025": return "This record was changed or removed by someone else. Reload the page and try again.";
      case "P2003": return "This refers to a record that no longer exists. Reload the page and try again.";
      case "P2028":
      case "P2034": return "The system is busy with another change to this record. Try again in a moment.";
      case "P1001":
      case "P1002":
      case "P1017": return "The database is not reachable right now. Try again in a minute.";
    }
  }
  if (e instanceof Prisma.PrismaClientInitializationError) return "The database is not reachable right now. Try again in a minute.";
  return null;
}

export function toActionError(e: unknown, action: string): ActionResult<never> {
  unstable_rethrow(e); // let redirect() and notFound() through
  if (e instanceof ZodError) return { ok: false, ...zodErrors(e) };
  const known = knownErrorMessage(e);
  if (known) {
    if (!(e instanceof UserError)) log.warn("action failed", { action, ...errorFields(e) });
    return { ok: false, error: known };
  }
  const ref = errorRef();
  log.error("action crashed", { action, ref, ...errorFields(e) });
  return { ok: false, error: `Something went wrong and nothing was saved. Try again; if it keeps happening, give your administrator this reference: ${ref}.` };
}

/** Wrap a server action so no failure reaches the user as a raw crash. */
export function safeAction<A extends unknown[], R>(name: string, fn: (...args: A) => Promise<ActionResult<R>>) {
  return async (...args: A): Promise<ActionResult<R>> => {
    try {
      return await fn(...args);
    } catch (e) {
      return toActionError(e, name) as ActionResult<R>;
    }
  };
}
