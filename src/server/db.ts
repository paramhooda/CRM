import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * One Prisma client per process, created on first use rather than at import: `next build` loads route modules
 * without a database (the Docker image is built that way), and in development Next.js reloads modules, so the
 * client is kept on `globalThis` to avoid opening a new connection pool on every change.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString, max: 10 });
  return new PrismaClient({ adapter, log: process.env.PRISMA_LOG === "query" ? ["query", "warn", "error"] : ["warn", "error"] });
}

function client(): PrismaClient {
  return (globalForPrisma.prisma ??= createClient());
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c) as unknown;
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(c) : value;
  },
});

/** A transaction client, as passed to service functions that must run inside a transaction. */
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
