// A small client for the API tests: logs in as a seeded person and keeps the session cookie.
import { expect } from "vitest";

export const BASE = process.env.API_BASE_URL ?? "http://localhost:3000";
export const PASSWORD = "Progression@123";

export const USERS = {
  admin: "admin@progression.com",
  salesHead: "vivek.malhotra@progression.com",
  regionalHead: "anita.deshmukh@progression.com",
  /** Reports to Vivek */
  rep: "rakesh.pawar@progression.com",
  /** Reports to Anita */
  repWest: "chirag.kapoor@progression.com",
  /** Reports to Vivek, used as "another rep" */
  rep2: "naresh.kumar@progression.com",
  presales: "rakesh.yadav@progression.com",
  presales2: "amit.rampal@progression.com",
  purchase: "meera.iyer@progression.com",
  purchase2: "deepak.verma@progression.com",
} as const;
export type UserKey = keyof typeof USERS;

export type ApiResponse<T = unknown> = { status: number; data?: T; error?: { code: string; message: string; fields?: Record<string, string> }; headers: Headers; raw: string };

export class Client {
  cookie = "";
  constructor(public label = "anonymous") {}

  async request<T = unknown>(method: string, path: string, body?: unknown, opts: { csrf?: boolean; raw?: BodyInit; headers?: Record<string, string> } = {}): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (this.cookie) headers.cookie = this.cookie;
    if (opts.csrf !== false && method !== "GET") headers["x-requested-with"] = "fetch";
    let payload: BodyInit | undefined = opts.raw;
    if (body !== undefined && !opts.raw) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${BASE}/api/v1${path}`, { method, headers, body: payload, redirect: "manual" });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      const [pair] = setCookie.split(";");
      if (pair) this.cookie = pair.endsWith("=") ? "" : pair;
    }
    const raw = await res.text();
    let json: { data?: T; error?: ApiResponse["error"] } = {};
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch {
      // not JSON (e.g. CSV)
    }
    return { status: res.status, data: json.data, error: json.error, headers: res.headers, raw };
  }
  get<T = unknown>(path: string) { return this.request<T>("GET", path); }
  post<T = unknown>(path: string, body?: unknown, opts?: { csrf?: boolean; raw?: BodyInit; headers?: Record<string, string> }) { return this.request<T>("POST", path, body, opts); }
  patch<T = unknown>(path: string, body?: unknown) { return this.request<T>("PATCH", path, body); }
  put<T = unknown>(path: string, body?: unknown) { return this.request<T>("PUT", path, body); }
  del<T = unknown>(path: string) { return this.request<T>("DELETE", path); }
}

const cache = new Map<string, Promise<Client>>();

/** A signed-in client for a seeded person (one session per test file run). */
export function as(key: UserKey): Promise<Client> {
  if (!cache.has(key)) {
    cache.set(
      key,
      (async () => {
        const c = new Client(key);
        const r = await c.post("/auth/login", { email: USERS[key], password: PASSWORD });
        if (r.status !== 200) throw new Error(`Login as ${key} failed: ${r.status} ${r.raw}`);
        return c;
      })(),
    );
  }
  return cache.get(key)!;
}

export const anon = () => new Client();

export function expectOk<T>(r: ApiResponse<T>, status = 200): T {
  expect(r.status, `${r.status} ${r.raw.slice(0, 300)}`).toBe(status);
  return r.data as T;
}

export function expectError(r: ApiResponse, status: number, code?: string) {
  expect(r.status, `${r.status} ${r.raw.slice(0, 300)}`).toBe(status);
  if (code) expect(r.error?.code).toBe(code);
  return r.error!;
}

export const uniq = (prefix: string) => `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** A yyyy-mm-dd some days from now, on the business day in India (the app counts "today" in IST). */
export const isoDate = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86_400_000 + 330 * 60_000).toISOString().slice(0, 10);
