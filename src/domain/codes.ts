// Record codes: ACC-0001, LEAD-0001, PRD-0001, OPP-FY27-0042 (deals are numbered per fiscal year).
import { fiscalYearOf, fyLabel } from "./fiscal";

export type CodePrefix = "ACC" | "LEAD" | "PRD" | "OPP";

/** The sequence key a code of this kind draws from. */
export function sequenceKey(prefix: CodePrefix, at = new Date()): string {
  return prefix === "OPP" ? `OPP-${fyLabel(fiscalYearOf(at))}` : prefix;
}

/** The code for the n-th record of a sequence. Four digits, growing when needed. */
export function formatCode(key: string, n: number | bigint): string {
  return `${key}-${String(n).padStart(4, "0")}`;
}
