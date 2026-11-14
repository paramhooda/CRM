"use client";
// The one way the browser talks to the server: JSON over /api/v1 with the request header every write needs.

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function call<T>(method: string, path: string, body?: unknown, opts: { form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = { "x-requested-with": "fetch" };
  let payload: BodyInit | undefined;
  if (opts.form) payload = opts.form;
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`/api/v1${path}`, { method, headers, body: payload, credentials: "same-origin" });
  const text = await res.text();
  let json: { data?: T; error?: { code: string; message: string; fields?: Record<string, string> } } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // not JSON
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      // A full reload on purpose: the session is gone, so every cached client state should go with it
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
    throw new ApiError(res.status, json.error?.code ?? "ERROR", json.error?.message ?? `Request failed (${res.status}).`, json.error?.fields);
  }
  return json.data as T;
}

export const api = {
  get: <T>(path: string) => call<T>("GET", path),
  post: <T>(path: string, body?: unknown) => call<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => call<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => call<T>("PUT", path, body),
  del: <T>(path: string) => call<T>("DELETE", path),
  upload: <T>(path: string, form: FormData) => call<T>("POST", path, undefined, { form }),
};

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
