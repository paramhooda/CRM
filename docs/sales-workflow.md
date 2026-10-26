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
