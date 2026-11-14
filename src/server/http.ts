import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z, type ZodType } from "zod";
import { AppError, Forbidden, Unauthorized, ValidationError } from "./errors";
import { getActor, type Actor } from "./auth/actor";
import type { Role } from "@/domain/scope";

/** Every API response is `{ data }` or `{ error: { code, message, fields? } }`. */
export type ApiError = { code: string; message: string; fields?: Record<string, string> };

export const CSRF_HEADER = "x-requested-with";
export const CSRF_VALUE = "fetch";

type Params = Record<string, string>;

type HandlerArgs<B, Q> = { req: NextRequest; actor: Actor; body: B; query: Q; params: Params; requestId: string };
type PublicHandlerArgs<B, Q> = Omit<HandlerArgs<B, Q>, "actor"> & { actor: Actor | null };

type Options<B, Q, Public extends boolean> = {
  /** Public routes (login, health) need no session */
  public?: Public;
  /** Roles allowed; anyone signed in when omitted */
  roles?: Role[];
  body?: ZodType<B>;
  query?: ZodType<Q>;
  fn: (args: Public extends true ? PublicHandlerArgs<B, Q> : HandlerArgs<B, Q>) => Promise<unknown>;
};

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function fail(status: number, error: ApiError) {
  return NextResponse.json({ error }, { status });
}

/** Turns a zod failure into field messages the form can show next to each input. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.map(String).join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Wraps a route handler: resolves the session (401), checks the role (403), requires the CSRF header on writes
 * (403), validates the body and query with zod (400) and turns thrown AppErrors into the error envelope.
 */
export function handle<B = undefined, Q = undefined, Public extends boolean = false>(opts: Options<B, Q, Public>) {
  return async (req: NextRequest, ctx: { params: Promise<Params> }): Promise<Response> => {
    const requestId = crypto.randomUUID();
    try {
      const actor = await getActor();
      if (!opts.public && !actor) throw new Unauthorized();
      if (opts.roles && actor && !opts.roles.includes(actor.role)) throw new Forbidden();
      if (req.method !== "GET" && req.method !== "HEAD" && req.headers.get(CSRF_HEADER) !== CSRF_VALUE)
        throw new Forbidden("This request must come from the application.");
      let body = undefined as B;
      if (opts.body) {
        let raw: unknown = undefined;
        if (req.headers.get("content-type")?.includes("application/json")) {
          try {
            raw = await req.json();
          } catch {
            throw new ValidationError("The request body is not valid JSON.");
          }
        }
        const parsed = opts.body.safeParse(raw ?? {});
        if (!parsed.success) throw new ValidationError(undefined, fieldErrors(parsed.error));
        body = parsed.data;
      }
      let query = undefined as Q;
      if (opts.query) {
        const obj: Record<string, string | string[]> = {};
        for (const [k, v] of req.nextUrl.searchParams.entries()) {
          const key = k.endsWith("[]") ? k.slice(0, -2) : k;
          if (k.endsWith("[]") || key in obj) obj[key] = [...(Array.isArray(obj[key]) ? (obj[key] as string[]) : obj[key] ? [obj[key] as string] : []), v];
          else obj[key] = v;
        }
        const parsed = opts.query.safeParse(obj);
        if (!parsed.success) throw new ValidationError("Some filters are not valid.", fieldErrors(parsed.error));
        query = parsed.data;
      }
      const params = await ctx.params;
      const result = await opts.fn({ req, actor: actor as Actor, body, query, params, requestId } as never);
      if (result instanceof Response) return result;
      return ok(result);
    } catch (e) {
      if (e instanceof AppError) return fail(e.status, { code: e.code, message: e.message, ...(e.fields ? { fields: e.fields } : {}) });
      console.error(`[api ${requestId}] ${req.method} ${req.nextUrl.pathname}`, e);
      return fail(500, { code: "INTERNAL", message: `Something went wrong on our side (reference ${requestId.slice(0, 8)}).` });
    }
  };
}

/** Query helpers shared by list routes. */
export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.string().regex(/^[a-zA-Z_.]+:(asc|desc)$/).optional(),
});
export type Pagination = z.infer<typeof pagination>;

export function paged<T>(rows: T[], total: number, p: Pagination) {
  return { rows, total, page: p.page, pageSize: p.pageSize, pages: Math.max(1, Math.ceil(total / p.pageSize)) };
}
