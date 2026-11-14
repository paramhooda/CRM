import "server-only";
import nodemailer from "nodemailer";
import { AppError } from "./errors";
import type { Actor } from "./auth/actor";
import { getSetting } from "./services/settings";

export type Attachment = { filename: string; content: Buffer; contentType: string };
export type Outgoing = { from: { name: string; address: string }; to: string[]; cc?: string[]; replyTo?: string; subject: string; text: string; attachments?: Attachment[] };

/** The SMTP server from Admin → Settings → Email; null when none is set up. */
export async function mailConfig() {
  const m = await getSetting("mail");
  return m.host ? m : null;
}

export const mailEnabled = async () => !!(await mailConfig());

/** Sends one message. 409 MAIL_OFF without a server, 502 MAIL_FAILED with the server's words when it refuses. */
export async function sendMail(msg: Outgoing): Promise<{ messageId: string }> {
  const m = await mailConfig();
  if (!m) throw new AppError(409, "MAIL_OFF", "Email is not set up. An administrator adds the mail server under Settings.");
  const transport = nodemailer.createTransport({ host: m.host!, port: m.port, secure: m.secure, auth: m.user ? { user: m.user, pass: m.password ?? "" } : undefined, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000 });
  try {
    const info = await transport.sendMail({ from: msg.from, to: msg.to, cc: msg.cc, replyTo: msg.replyTo, subject: msg.subject, text: msg.text, attachments: msg.attachments });
    return { messageId: info.messageId };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[mail] send failed", detail);
    throw new AppError(502, "MAIL_FAILED", `The mail server refused the message: ${detail.slice(0, 200)}`);
  } finally {
    transport.close();
  }
}

/** A test message to the admin who set the server up. */
export async function sendTestMail(actor: Actor) {
  const r = await sendMail({ from: { name: actor.fullName, address: actor.email }, to: [actor.email], subject: "Progression CRM: test email", text: `This is a test from Progression CRM, sent by ${actor.fullName}. If you can read this, the mail server is set up.` });
  return { ok: true, to: actor.email, ...r };
}
