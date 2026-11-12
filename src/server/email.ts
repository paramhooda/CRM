// Outgoing email through the SMTP server set in Admin → Email. Optional: when email is off, nothing is sent and
// features that need it (forgot password) are hidden.
import "server-only";
import nodemailer from "nodemailer";
import { openSecret } from "@/lib/secret-box";
import { getEmailSettings, type EmailSettings } from "./settings";
import { log } from "./log";

export type Mail = { to: string; subject: string; text: string };

function transport(s: EmailSettings) {
  const pass = s.passwordSealed ? openSecret(s.passwordSealed) : null;
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.security === "tls",
    requireTLS: s.security === "starttls",
    ignoreTLS: s.security === "none",
    auth: s.user ? { user: s.user, pass: pass ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

/** Send with the given settings; throws with the server's reason. Used by "Send test email". */
export async function sendWith(s: EmailSettings, mail: Mail) {
  await transport(s).sendMail({ from: { name: s.fromName || "Progression CRM", address: s.fromEmail }, to: mail.to, subject: mail.subject, text: mail.text });
}

/** Send if email is set up. Never throws: a mail problem must not undo or block the user's action. */
export async function sendMail(mail: Mail): Promise<boolean> {
  const s = await getEmailSettings();
  if (!s.enabled || !s.host || !s.fromEmail) {
    log.info("email skipped: email is not set up", { subject: mail.subject });
    return false;
  }
  try {
    await sendWith(s, mail);
    log.info("email sent", { subject: mail.subject });
    return true;
  } catch (e) {
    log.error("email failed", { subject: mail.subject, error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}
