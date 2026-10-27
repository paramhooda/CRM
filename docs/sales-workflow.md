# Sales process: BOQ → Pricing → Quote

Each team owns one pipeline stage. The CRM moves the deal to the next stage as each team hands over, so the stage always tells you who has the deal.

| Stage | Owner | Work | Hand-over (moves the deal on) |
|---|---|---|---|
| Identified, Qualified | Sales | Qualify; add quick-estimate lines (BU, category, OEM or "To be decided", value) | **Request BOQ from presales** → BOQ |
| **BOQ** | Presales | Turn estimates into catalogue lines | **Submit BOQ** → Pricing |
| **Pricing** | Purchase | Enter OEM and distributor costs | **Pricing complete** → back to sales, still in Pricing |
| Pricing (priced) | Sales | Add margin | **Create & send quote** → Proposal Submitted |
| Proposal Submitted, Negotiation | Sales | Follow up with the customer | **Record customer response**; mark **Won** with the PO |

Deals without presales are fine: sales can add lines and **Request pricing** directly, which moves the deal from Qualified to Pricing.

## What is asked, by whom, and when

Each person enters only what they know at their step. Everything else is derived.

| Step | Who | Asked for | Derived, never typed |
|---|---|---|---|
| **New deal** | Sales | Account, customer contact (optional until Qualified), name, expected close, next step; what's being sold as business unit → category → OEM → value (one-time or recurring with a term); presales yes / no; procurement (bid date for RFP / tender); deal registration (only for OEMs that run it). Lead source, competition and notes are optional, under More details. | Account type (from the account), deal type options, stage (Identified), probability, forecast (Pipeline), revenue model, contract term and ARR (from the lines), owner (you) |
| **Request BOQ** | Sales | Presales engineer, needed by, customer requirement, deliverables (BOQ, solution document, presentation, site survey, PoC / demo); sites, only when a survey is asked for | Presales owner, stage (BOQ) |
| **Submit BOQ** | Presales | BOQ lines (catalogue products), solution summary, assumptions and exclusions | Which lines purchase must price, stage (Pricing) |
| **Pricing** | Purchase | Unit cost, distributor, supplier validity | Margin |
| **Quote** | Sales | Margin %, validity, terms | Sell prices, deal value, stage (Proposal Submitted) |
| **Won** | Sales | Customer PO number and date | Contract dates, billing lines |

### Does the deal need presales?

The form suggests it from the categories, and sales can change it. An admin sets which categories need presales under Settings → Business units and categories.

- **Needs presales (solution deal)**, for example servers, storage, networking, cloud, managed services, SOC and compliance. Presales designs the solution and prepares the BOQ, then purchase prices it. Pricing cannot be requested until presales has submitted a BOQ.
- **No presales (resale deal)**, for example laptops, desktops and licences. Sales replaces the estimate with catalogue products on Line items and requests pricing directly; the BOQ stage is skipped. Sales can still pull in presales later, which makes it a solution deal.

### Fields that follow other fields

- Customer contact choices come from the selected account.
- Deal type: a new logo is always New business. An existing customer chooses Upsell, Cross-sell or Renewal.
- Category choices come from the business unit. OEM choices come from the category: the OEMs in the catalogue for it are listed first, then the rest, plus "To be decided".
- The contract term appears only for recurring lines.
- The bid submission date appears only for RFP and tender.
- Deal registration appears only when an OEM on the deal runs a registration programme. An admin sets which OEMs do, under Settings → OEMs.
- Sites to survey appear only when a site survey is asked for.
- On the edit form, expected margin is shown only until purchase prices the lines.

## Stage rules (enforced for everyone)

The rules apply to the stage bar, the pipeline board and the edit form, and the server checks them again on every change. A stage that can't be clicked explains why when you point at it.

| Move | Who | Rule |
|---|---|---|
| New deal | Sales | Starts at **Identified** or **Qualified**; Qualified needs a customer contact. |
| Identified → Qualified | Owner or manager | Needs a customer contact and a close date that has not passed. |
| → BOQ, → Pricing, → Proposal Submitted | Nobody by hand | Set by the workflow: request a BOQ, submit the BOQ (or request pricing), send the quote. |
| Proposal Submitted → Negotiation | Owner or manager | Needs a quote with the customer and nothing open with presales or purchase. |
| → Won | Owner or manager | Only from Proposal Submitted or Negotiation, with a quote with the customer, nothing open with presales or purchase, and the customer PO. Lines must be priced with HSN/SAC. |
| → Lost / Dropped | Owner or manager | From any open stage, with a loss reason. |
| Skipping stages | Nobody | Deals move one stage at a time. |
| Moving back | Sales manager only | A correction, with a reason. Never into BOQ, Pricing or Proposal Submitted (use Request BOQ change), and not while a BOQ or pricing request is open. |
| Hold | Owner or manager | Needs a reason. While on hold, the only moves are **Resume** (back to the stage it was held from), Lost or Dropped. |
| Reopen a closed deal | Sales manager only | Needs a reason. Returns to the stage it was closed from. |

Other rules:
- **Probability** follows the stage and is not edited by hand, so the weighted pipeline is comparable across deals.
- **Commit** is allowed only once the quote is with the customer (Proposal Submitted or Negotiation).
- Closed and on-hold deals are omitted from the forecast.
- A changed close date or next-step date cannot be in the past.
- **Closed deals are read-only.** Only a sales manager can edit them, for corrections.
- **The edit form never changes the stage.**
- Every stage change is recorded with who made it and why (hold reason, correction reason, PO or loss reason). The reason shows in the stage journey on the History tab.

## What everyone sees on a deal

Under the stage path, one line says:
- where the deal is (for example "Pricing with purchase", "Priced · ready to quote", "Quote v2 with customer");
- who has it, and the due date (red when overdue);
- the one thing blocking it, if any.

On the right is **your** next action as a button. Less common actions sit under **More**. A sales manager sees the status and the sales-side actions (reassign, cancel, request a BOQ change). Presales and purchase work stays with the person assigned to it.

The full trail (every request, revision, question and send-back) is on the **History** tab.

## When something changes

| Situation | Action | What happens |
|---|---|---|
| Customer or sales changes the scope | **Request BOQ change** (More) | Presales gets revision N+1 with the reason. Pricing in progress is stopped and the deal returns to BOQ. Only the lines presales change go back to purchase. |
| Presales needs information | **Ask sales a question** (More) | Sales sees **Answer presales**. The presales due date pauses while waiting. |
| Purchase cannot price a line (end-of-sale part, wrong SKU) | **Send back to presales** (More) | Presales gets a high-priority revision and the deal returns to BOQ. |
| Customer wants a different price | **Send revised quote** | Re-price at a new margin in the same dialog. The old quote version is superseded. |
| Supplier pricing has expired | **Re-validate costs** | Purchase re-confirms every line's cost. Quoting is blocked until then. |
| Someone is away | **Reassign** (More) | The new owner is notified. |
| Work no longer needed | **Cancel request** (More) | A reason is required, and the assignee is told to stop. |
| Deal closed or put on hold | Automatic | Anyone still working on it is told to stop or pause. |

## Safeguards

- Only one BOQ request and one pricing request can be open per deal.
- Products and quantities are locked while purchase is pricing. While presales is working, only the assigned engineer can change them.
- If two people edit the line items at once, the second save is rejected instead of overwriting the first.
- A line whose product, quantity or term changes after it was costed is marked **needs re-pricing**, and the deal cannot be quoted until purchase confirms it.
- Quotes need every line costed, no estimate lines, a real OEM on every line, and unexpired supplier pricing.

## Automatic reminders

| When | Who is notified |
|---|---|
| A BOQ or pricing request is due within a day | The person it is assigned to |
| A BOQ or pricing request is overdue | That person, the sales owner and their manager |
| A presales question has gone unanswered for 2 days | The sales owner |
| A quote expires within 3 days | The sales owner |

The rules are in `src/lib/workflow.ts` (unit-tested), the actions in `src/server/actions/workflow.ts`, and the status line in `src/components/opportunities/deal-status.tsx`.
