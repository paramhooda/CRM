import { handle } from "@/server/http";

export const GET = handle({ fn: async ({ actor }) => actor });
