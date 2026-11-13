// Demo data (accounts, contacts, leads, deals). Filled in by a later commit.
import type { PrismaClient } from "../../src/generated/prisma/client";
import type { Reference } from "./reference";

export async function seedDemo(_db: PrismaClient, _ref: Reference, log: (s: string) => void) {
  log("Demo data: not yet available");
}
