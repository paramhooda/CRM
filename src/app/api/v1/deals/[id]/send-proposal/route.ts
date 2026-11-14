import { handle } from "@/server/http";
import { sendProposalSchema } from "@/contracts/emails";
import { sendProposal } from "@/server/services/emails";

/** Emails the proposal (quote and documents attached) and moves the deal to Proposal Submitted. */
export const POST = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], body: sendProposalSchema, fn: ({ actor, params, body, requestId }) => sendProposal(actor, params.id!, body, requestId) });
