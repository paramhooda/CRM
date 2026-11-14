import { handle } from "@/server/http";
import { allLookups } from "@/server/services/lookups";

export const GET = handle({ fn: () => allLookups() });
