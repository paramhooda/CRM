/** Filters live in the URL so every view can be bookmarked and shared. */
export type Query = Record<string, string | string[] | undefined>;

export function queryString(current: URLSearchParams | Query, patch: Record<string, string | null | undefined>): string {
  const params = current instanceof URLSearchParams ? new URLSearchParams(current.toString()) : new URLSearchParams();
  if (!(current instanceof URLSearchParams)) for (const [k, v] of Object.entries(current)) if (v !== undefined) (Array.isArray(v) ? v : [v]).forEach((x) => params.append(k, x));
  for (const [k, v] of Object.entries(patch)) {
    params.delete(k);
    if (v !== null && v !== undefined && v !== "") params.set(k, v);
  }
  if (!("page" in patch)) params.delete("page");
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
