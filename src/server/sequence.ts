import "server-only";
import type { Tx } from "./db";
import { formatCode, sequenceKey, type CodePrefix } from "@/domain/codes";

/** Hands out the next record code atomically (one row per counter, incremented in the caller's transaction). */
export async function nextCode(tx: Pick<Tx, "$queryRaw">, prefix: CodePrefix, at = new Date()): Promise<string> {
  const key = sequenceKey(prefix, at);
  const rows = await tx.$queryRaw<{ n: bigint }[]>`
    INSERT INTO sequences (key, next_value) VALUES (${key}, 2)
    ON CONFLICT (key) DO UPDATE SET next_value = sequences.next_value + 1
    RETURNING next_value - 1 AS n`;
  return formatCode(key, rows[0]!.n);
}
