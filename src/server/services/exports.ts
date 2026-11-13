import "server-only";
import type { Actor } from "../auth/actor";
import { NotFound } from "../errors";
import { csvResponse, fmtDate, stamp } from "../csv";
import type { CsvColumn } from "@/domain/csv";
import { allAccounts, type AccountListRow } from "./accounts";
import { allContacts, type ContactRow } from "./contacts";

export type ExportQuery = Record<string, string | string[] | undefined>;

const str = (q: ExportQuery, k: string) => (typeof q[k] === "string" ? (q[k] as string) : undefined);
const bool = (q: ExportQuery, k: string) => str(q, k) === "true";

/** Every export uses the same query and the same scope as its list, so the file matches the screen. */
const EXPORTS: Record<string, (actor: Actor, q: ExportQuery) => Promise<Response>> = {
  accounts: async (actor, q) => {
    const rows = await allAccounts(actor, { q: str(q, "q"), industryId: str(q, "industry"), segmentId: str(q, "segment"), ownerId: str(q, "owner"), includeDeleted: bool(q, "includeDeleted") }, str(q, "sort"));
    const cols: CsvColumn<AccountListRow>[] = [
      { header: "Code", value: (r) => r.code },
      { header: "Account", value: (r) => r.name },
      { header: "GSTIN", value: (r) => r.gstin },
      { header: "Industry", value: (r) => r.industry?.name },
      { header: "Segment", value: (r) => r.segment?.name },
      { header: "City", value: (r) => r.city },
      { header: "State", value: (r) => r.state },
      { header: "Owner", value: (r) => r.owner.fullName },
      { header: "Contacts", value: (r) => r._count.contacts },
      { header: "Open deals", value: (r) => r._count.deals },
      { header: "Created", value: (r) => fmtDate(r.createdAt) },
      { header: "Updated", value: (r) => fmtDate(r.updatedAt) },
    ];
    return csvResponse(`accounts-${stamp()}.csv`, cols, rows);
  },
  contacts: async (actor, q) => {
    const rows = await allContacts(actor, { q: str(q, "q"), accountId: str(q, "account_id"), includeDeleted: bool(q, "includeDeleted") }, str(q, "sort"));
    const cols: CsvColumn<ContactRow>[] = [
      { header: "First name", value: (r) => r.firstName },
      { header: "Last name", value: (r) => r.lastName },
      { header: "Account", value: (r) => r.account.name },
      { header: "Account code", value: (r) => r.account.code },
      { header: "Designation", value: (r) => r.designation },
      { header: "Department", value: (r) => r.department },
      { header: "Email", value: (r) => r.email },
      { header: "Phone", value: (r) => r.phone },
      { header: "Mobile", value: (r) => r.mobile },
      { header: "Primary", value: (r) => (r.isPrimary ? "Yes" : "No") },
      { header: "Updated", value: (r) => fmtDate(r.updatedAt) },
    ];
    return csvResponse(`contacts-${stamp()}.csv`, cols, rows);
  },
};

export function registerExport(entity: string, fn: (actor: Actor, q: ExportQuery) => Promise<Response>) {
  EXPORTS[entity] = fn;
}

export async function runExport(actor: Actor, entity: string, q: ExportQuery) {
  const fn = EXPORTS[entity];
  if (!fn) throw new NotFound("Unknown export.");
  return fn(actor, q);
}
