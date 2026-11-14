import { handle } from "@/server/http";
import { testAssistant } from "@/server/ai";

/** One tiny completion to prove the assistant's key and model work. */
export const POST = handle({ roles: ["ADMIN"], fn: () => testAssistant() });
