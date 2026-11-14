import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { AppError, Conflict, ValidationError } from "../errors";
import { recordEvent } from "../audit";
import { assertCanEditDeal, assertPermission } from "../authz/scope";
import type { SendDealEmailInput, SendProposalInput } from "@/contracts/emails";
import { findMove, isOpen } from "@/domain/stages";
import { mailEnabled, sendMail } from "../mail";
import { activeRules, approvalStateFor, dealFacts, loadDeal, rulesMatchFor } from "./deals";
import { moveStage } from "./stages";

const emailSelect = { id: true, to: true, cc: true, subject: true, body: true, documentIds: true, status: true, error: true, sentAt: true, sentBy: { select: { id: true, fullName: true } } } satisfies Prisma.DealEmailSelect;

export async function listEmails(actor: Actor, dealId: string) {
  assertPermission(actor, "deals.viewSales");
  await loadDeal(actor, dealId, { includeDeleted: true });
  const rows = await db.dealEmail.findMany({ where: { dealId }, select: emailSelect, orderBy: { sentAt: "desc" }, take: 50 });
  return { rows };
}

/** Whether the portal can send at all; the dialog shows download-only otherwise. */
export const emailStatus = async () => ({ enabled: await mailEnabled() });

/**
 * Sends one email from the signed-in person to the customer, with the chosen deal documents attached, and keeps it
 * on the deal. 409 MAIL_OFF without a mail server; a refused message is kept as FAILED and the error is raised.
 */
export async function sendDealEmail(actor: Actor, dealId: string, input: SendDealEmailInput, requestId: string) {
  assertPermission(actor, "deals.viewSales");
  const deal = await loadDeal(actor, dealId);
  await assertCanEditDeal(actor, deal);
  if (!(await mailEnabled())) throw new Conflict("Email is not set up. An administrator adds the mail server under Settings; you can still download the quote and send it yourself.", "MAIL_OFF");
  const docs = input.documentIds.length ? await db.dealDocument.findMany({ where: { id: { in: input.documentIds }, dealId, deletedAt: null } }) : [];
  if (docs.length !== input.documentIds.length) throw new ValidationError("One of the attachments is no longer on the deal.", { documentIds: "Reload and pick again." });
  const sender = await db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { fullName: true, email: true } });
  const record = (status: "SENT" | "FAILED", error: string | null) =>
    db.$transaction(async (tx) => {
      const row = await tx.dealEmail.create({ data: { dealId, sentById: actor.id, to: input.to, cc: input.cc, subject: input.subject, body: input.body, documentIds: input.documentIds, status, error }, select: emailSelect });
      await recordEvent(tx, { entityType: "deal_email", entityId: row.id, dealId, action: "CREATE", userId: actor.id, requestId, newValue: `${status === "SENT" ? "Emailed" : "Email failed to"} ${input.to.join(", ")}: ${input.subject}${docs.length ? ` (${docs.map((d) => d.fileName).join(", ")})` : ""}` });
      return row;
    });
  try {
    await sendMail({ from: { name: sender.fullName, address: sender.email }, to: input.to, cc: input.cc, replyTo: sender.email, subject: input.subject, text: input.body, attachments: docs.map((d) => ({ filename: d.fileName, content: Buffer.from(d.content), contentType: d.contentType })) });
  } catch (e) {
    if (e instanceof AppError && e.code === "MAIL_FAILED") await record("FAILED", e.message);
    throw e;
  }
  return record("SENT", null);
}

/** Sends the proposal and, once it has gone, moves the deal to Proposal Submitted with the usual gates. */
export async function sendProposal(actor: Actor, dealId: string, input: SendProposalInput, requestId: string) {
  const deal = await loadDeal(actor, dealId);
  if (!isOpen(deal.stage)) throw new Conflict("This deal is not open.", "WRONG_STAGE");
  const rules = await activeRules();
  const facts = dealFacts(deal, approvalStateFor(deal, rules), rulesMatchFor(deal, rules).map((m) => m.rule.name));
  const move = findMove(facts, { canEdit: true, isManager: false }, "ADVANCE");
  const toProposal = move?.toStage === "PROPOSAL_SUBMITTED";
  if (toProposal && !move.enabled) throw new Conflict(move.reason ?? "The proposal can't go out yet.", "NOT_ALLOWED");
  const { version, ...mail } = input;
  const email = await sendDealEmail(actor, dealId, mail, requestId);
  const moved = toProposal ? await moveStage(actor, dealId, { action: "ADVANCE", version, reason: null, lossReasonId: null, lossNotes: null, poNumber: null, presalesAssigneeId: null, presalesDueDate: null, presalesScope: null }, requestId) : null;
  return { email, moved: !!moved };
}
