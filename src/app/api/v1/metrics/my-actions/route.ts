import { handle } from "@/server/http";
import { myActions } from "@/server/services/metrics";

/** What needs the signed-in person now, for every role. */
export const GET = handle({ fn: ({ actor }) => myActions(actor) });
