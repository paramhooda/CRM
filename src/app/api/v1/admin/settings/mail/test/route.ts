import { handle } from "@/server/http";
import { sendTestMail } from "@/server/mail";

/** Sends a test email to the signed-in admin through the configured server. */
export const POST = handle({ roles: ["ADMIN"], fn: ({ actor }) => sendTestMail(actor) });
