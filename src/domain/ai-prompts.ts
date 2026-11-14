// The prompts behind "Draft with AI" and "Deal brief", built from plain data so they can be unit-tested. The
// caller decides what the viewer may see; the scope and BOQ prompts never carry prices or margin.
import type { AiDraftKind } from "@/contracts/ai";

export type PromptLine = { lineNo: number; description: string; businessUnit: string; subBusinessUnit: string; oem: string; quantity: string; unit: string; revenueModel: "ONE_TIME" | "ARR"; termMonths: number | null; unitSalesPrice?: string | null; unitPurchaseCost?: string | null };
export type PromptHistory = { when: string; from: string | null; to: string; note: string | null };
export type DealForPrompt = {
  code: string;
  name: string;
  account: string;
  stage: string;
  owner: string;
  presales: string | null;
  description: string | null;
  expectedCloseDate: string;
  daysInStage: number;
  lines: PromptLine[];
  documents: string[];
  latestScope: string | null;
  latestBoqSummary: string | null;
  nextHeadline: string;
  history: PromptHistory[];
  /** Sales-side only; left out for presales and purchase */
  money?: { value: string; gmPct: string | null; forecast: string; approvalState: string };
};

export type Prompt = { system: string; user: string; maxTokens: number };

const SYSTEM = "You write for an Indian IT systems integrator's CRM. Plain, direct English in sentence case; no marketing tone, no headings, no emojis, no markdown. Use only the facts given; never invent products, quantities, prices or dates. Amounts are INR.";

function lineText(l: PromptLine, withMoney: boolean) {
  const model = l.revenueModel === "ARR" ? `recurring, ${l.termMonths ?? "?"} months` : "one-time";
  const money = withMoney ? [l.unitPurchaseCost ? `cost ${l.unitPurchaseCost}` : "cost unknown", l.unitSalesPrice ? `price ${l.unitSalesPrice}` : "unpriced"].join(", ") : "";
  return `${l.lineNo}. ${l.description}; ${l.businessUnit} / ${l.subBusinessUnit}; OEM ${l.oem}; ${l.quantity} ${l.unit}; ${model}${money ? `; ${money}` : ""}`;
}

/** Strips anything sales-side so a presales or purchase user's draft can never carry a price. */
export function technicalOnly(d: DealForPrompt): DealForPrompt {
  const { money: _m, ...rest } = d;
  return { ...rest, lines: d.lines.map(({ unitSalesPrice: _p, unitPurchaseCost: _c, ...l }) => l) };
}

export function buildPrompt(kind: AiDraftKind, d: DealForPrompt): Prompt {
  const base = [`Deal ${d.code}: ${d.name}`, `Customer: ${d.account}`, `Stage: ${d.stage} (${d.daysInStage} days)`, `Owner: ${d.owner}${d.presales ? `; presales: ${d.presales}` : ""}`, `Expected close: ${d.expectedCloseDate}`, d.description ? `Description: ${d.description}` : null, d.documents.length ? `Documents: ${d.documents.join("; ")}` : "Documents: none"].filter(Boolean).join("\n");
  if (kind === "scope") {
    const t = technicalOnly(d);
    const lines = t.lines.length ? t.lines.map((l) => lineText(l, false)).join("\n") : "(no lines yet)";
    return {
      system: SYSTEM,
      user: `${base}\n\nLines so far:\n${lines}\n\nWrite the scope sales gives presales for the BOQ: what to size and specify, assumptions to confirm with the customer, and what the deliverable is. Three to six short sentences, as one paragraph. No prices.`,
      maxTokens: 300,
    };
  }
  if (kind === "boq_summary") {
    const t = technicalOnly(d);
    const lines = t.lines.length ? t.lines.map((l) => lineText(l, false)).join("\n") : "(no lines)";
    return {
      system: SYSTEM,
      user: `${base}\n${t.latestScope ? `Scope asked for: ${t.latestScope}\n` : ""}\nBOQ lines:\n${lines}\n\nWrite the summary presales gives sales when submitting the BOQ: what was specified and why, assumptions, open points. Three to six short sentences, as one paragraph. No prices.`,
      maxTokens: 300,
    };
  }
  if (kind === "email") {
    const t = technicalOnly(d);
    const lines = t.lines.length ? t.lines.map((l) => `- ${l.description} (${l.quantity} ${l.unit}${l.revenueModel === "ARR" ? `, ${l.termMonths ?? "?"} months` : ""})`).join("\n") : "(no lines)";
    return {
      system: SYSTEM,
      user: `${base}\n\nWhat is being proposed:\n${lines}\n\nWrite the email ${d.owner} sends the customer contact with the quotation attached: a short greeting, what is enclosed and what it covers in one or two sentences, the validity, an offer to walk them through it, and a sign-off with the sender's name. Plain text, five to eight short sentences, no subject line, no prices.`,
      maxTokens: 350,
    };
  }
  const lines = d.lines.length ? d.lines.map((l) => lineText(l, true)).join("\n") : "(no lines)";
  const history = d.history.length ? d.history.map((h) => `${h.when}: ${h.from ? `${h.from} → ` : ""}${h.to}${h.note ? ` (${h.note})` : ""}`).join("\n") : "(none)";
  const money = d.money ? `Value ${d.money.value}; GM ${d.money.gmPct ?? "unknown"}%; forecast ${d.money.forecast}; approval ${d.money.approvalState}` : "";
  return {
    system: SYSTEM,
    user: `${base}\n${money}\nWhat's next: ${d.nextHeadline}\n${d.latestScope ? `Presales scope: ${d.latestScope}\n` : ""}${d.latestBoqSummary ? `BOQ summary: ${d.latestBoqSummary}\n` : ""}\nLines:\n${lines}\n\nStage history:\n${history}\n\nWrite a brief for a sales manager's pipeline call: where the deal stands, what is being sold, the money and margin, what is blocking or waiting, and the single most useful next action. Four to eight short sentences in two short paragraphs.`,
    maxTokens: 450,
  };
}
