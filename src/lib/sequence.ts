import type { Tx } from "./db";
import { fiscalPeriod } from "./fiscal";

/** Atomically allocate the next human-readable code, e.g. OPP-FY27-0042, ACC-0007, QT-FY27-0003. */
export async function nextCode(tx: Tx, prefix: "OPP" | "ACC" | "LEAD" | "QT", at = new Date()): Promise<string> {
  const fy = fiscalPeriod(at).fiscalYear;
  const perYear = prefix === "OPP" || prefix === "QT";
  const key = perYear ? `${prefix}-FY${String(fy).slice(-2)}` : prefix;
  const seq = await tx.sequence.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${key}-${String(seq.value).padStart(4, "0")}`;
}
