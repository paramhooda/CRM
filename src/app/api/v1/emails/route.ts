import { handle } from "@/server/http";
import { emailStatus } from "@/server/services/emails";

/** Whether the portal can send email (a mail server is set up). */
export const GET = handle({ fn: () => emailStatus() });
