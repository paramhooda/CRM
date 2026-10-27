# Sales process: BOQ → Pricing → Quote

Each team owns one pipeline stage. The CRM moves the deal to the next stage as each team hands over, so the stage always tells you who has the deal.

| Stage | Owner | Work | Hand-over (moves the deal on) |
|---|---|---|---|
| Identified, Qualified | Sales | Qualify; add quick-estimate lines (BU, category, OEM or "To be decided", value) | **Request BOQ from presales** → BOQ |
| **BOQ** | Presales | Turn estimates into catalogue lines | **Submit BOQ** → Pricing |
| **Pricing** | Purchase | Enter OEM and distributor costs for third-party lines | **Pricing complete** → back to sales, still in Pricing |
| Pricing (priced) | Sales | Add margin | **Create & send quote** → Proposal Submitted |
| Proposal Submitted, Negotiation | Sales | Follow up with the customer | **Record customer response**; mark **Won** with the PO |

Deals without presales are fine: sales can add lines and **Request pricing** directly, which moves the deal from Qualified to Pricing.

## What is asked, by whom, and when

Each person enters only what they know at their step. Everything else is derived.

| Step | Who | Asked for | Derived, never typed |
|---|---|---|---|
| **New deal** | Sales | Account, customer contact (optional until Qualified), name, expected close, next step; what's being sold as business unit → category → OEM → value (one-time or recurring with a term); presales yes / no; procurement (bid date for RFP / tender); deal registration (only for OEMs that run it). Lead source, competition and notes are optional, under More details. | Account type (from the account), deal type options, stage (Identified), probability, forecast (Pipeline), revenue model, contract term and ARR (from the lines), owner (you) |
| **Request BOQ** | Sales | Presales engineer, needed by, customer requirement, deliverables (BOQ, solution document, presentation, site survey, PoC / demo); sites, only when a survey is asked for | Presales owner, stage (BOQ) |
| **Submit BOQ** | Presales | BOQ lines (catalogue products), solution summary, assumptions and exclusions; the cost of own-brand lines not on the rate card | Each line's cost source, which lines purchase must price, rate card costs, stage (Pricing) |
| **Pricing** | Purchase | Unit cost, distributor and supplier validity, per third-party line | Margin, the earliest validity |
| **Quote** | Sales | Margin %, validity, terms | Sell prices, deal value, stage (Proposal Submitted) |
| **Won** | Sales | Customer PO number and date | Contract dates, billing lines |

### Does the deal need presales?

The form suggests it from the categories, and sales can change it. An admin sets which categories need presales under Settings → Business units and categories.

- **Needs presales (solution deal)**, for example servers, storage, networking, cloud, managed services, SOC and compliance. Presales designs the solution and prepares the BOQ, then purchase prices it. Pricing cannot be requested until presales has submitted a BOQ.
- **No presales (resale deal)**, for example laptops, desktops and licences. Sales replaces the estimate with catalogue products on Line items and requests pricing directly; the BOQ stage is skipped.

### Bringing presales in later

A deal that started without presales can bring them in at any stage until it closes, once it is qualified: **Involve presales** (in the status line's More menu). The dialog asks why, who and by when, and says what will change before anything is sent:
- The deal becomes a solution deal. Presales owns the BOQ from then on, and BOQ is added to the stage path.
- Presales starts from the lines sales already added. Only the lines they change go back to purchase.
- If purchase is pricing, that request is stopped and purchase is told. Pricing is requested again when presales submits the BOQ.
- From Qualified or Pricing the deal moves to BOQ. From Proposal Submitted or Negotiation it stays where it is: the quote stays with the customer, and sales sends a revised quote after presales submits.
- The reason and the path change are recorded on the History tab.

The edit form only switches the path while the deal is still Identified, before any work has started. After that, presales comes in through **Involve presales**, so there is always an engineer and a due date. Going the other way, **Skip BOQ** (from inside the BOQ stage) turns a solution deal into a resale deal.

### Fields that follow other fields

- Customer contact choices come from the selected account.
- Deal type: a new logo is always New business. An existing customer chooses Upsell, Cross-sell or Renewal.
- Category choices come from the business unit. OEM choices come from the category: the OEMs in the catalogue for it are listed first, then the rest, plus "To be decided".
- The contract term appears only for recurring lines.
- The bid submission date appears only for RFP and tender.
- Deal registration appears only when an OEM on the deal runs a registration programme. An admin sets which OEMs do, under Settings → OEMs.
- Sites to survey appear only when a site survey is asked for.
- On the edit form, expected margin is shown only until purchase prices the lines.

## Where each line's cost comes from

Most MSPs and system integrators split cost the same way: bought-in products are priced by procurement against a supplier quote, and their own services are costed from an internal rate card, with presales costing anything the rate card doesn't cover. This CRM does the same, per line.

| Cost source | Default for | Who enters the cost | Goes to purchase? |
|---|---|---|---|
| **Purchase** | Third-party OEMs (Dell, Cisco, Microsoft…) | Purchase, with that supplier's validity on the line | Yes |
| **Rate card** | Own-brand (Progression, Neon Cloud) catalogue items with a standard cost | Nobody: the catalogue's standard cost is applied automatically | No |
| **Presales** | Own-brand custom lines, or own-brand items presales re-costs for this deal | Presales, with a short note on how it was costed | No |

- An admin marks the own brands under Settings → Picklists → OEMs → **Own brand**.
- Third-party lines are always costed by purchase. Own-brand lines can be switched between the three. **Source via purchase** is for own-brand work that is bought in, such as subcontracted services or back-to-back AMC.
- Presales reworks a rate card cost by typing a different cost on the line. The line becomes a presales cost for this deal; the catalogue is unchanged.
- A device-based SOC or NOC rate card is a catalogue product priced per device, so it is costed from the rate card like any other. Deals that don't fit the card are re-costed by presales.
- Each purchase line carries its own supplier's validity, because one deal often has prices from several distributors. Purchase sets it on the line; the date given at **Pricing complete** fills any line without one. **Re-validate costs** sends back only the lines whose price has lapsed.
- Presales must enter the cost of own-brand lines before submitting the BOQ. A deal with only own-brand lines skips purchase altogether.
- Sales sees where each cost came from on Line items: Purchase (with validity and distributor), Rate card or Presales, or who it is still waiting on.

## Stage rules (enforced for everyone)

The stage bar works like Salesforce Path:
- **The stages show progress only and cannot be clicked.**
- **One button advances the deal to its next stage.**
  - Into BOQ, Pricing and Proposal Submitted, the advance *is* the hand-over: **Advance to BOQ** opens the BOQ request, **Advance to Pricing** opens Submit BOQ (presales) or Request pricing (resale deals), and **Advance to Proposal** opens Create & send quote.
  - Elsewhere it moves the deal directly: Advance to Qualified, Advance to Negotiation, and **Close as won** from Negotiation.
  - When the next step belongs to someone else, the button is disabled and says who it is waiting on.
- **Resale deals have their own path without BOQ**, the way Salesforce gives each sales process its own stages.
- **More** holds the rest: Put on hold, Move back one stage (managers), Skip BOQ (only while in BOQ), Close as won (from Proposal Submitted), Close as lost, Drop, Reopen (managers).

These rules apply to the stage bar, the pipeline board and the edit form, and the server checks them again on every change.

| Move | Who | Rule |
|---|---|---|
| New deal | Sales | Starts at **Identified** or **Qualified**; Qualified needs a customer contact. |
| Identified → Qualified | Owner or manager | Needs a customer contact and a close date that has not passed. BOQ and pricing can only be requested once the deal is qualified. |
| → BOQ, → Pricing, → Proposal Submitted | Nobody by hand | Set by the workflow: request a BOQ, submit the BOQ (or request pricing), send the quote. |
| Proposal Submitted → Negotiation | Owner or manager | Needs a quote with the customer and nothing open with presales or purchase. |
| → Won | Owner or manager | Only from Proposal Submitted or Negotiation, with a quote with the customer, nothing open with presales or purchase, and the customer PO. Lines must be priced with HSN/SAC. |
| → Lost / Dropped | Owner or manager | From any open stage, with a loss reason. |
| Skipping a stage | Owner or manager | Only from inside the stage, with a reason. Today that is BOQ: **Skip BOQ (no presales needed)** cancels any open BOQ request, makes it a resale deal and moves it to Pricing. Nobody can jump ahead from an earlier stage. |
| Moving back | Sales manager only | One stage at a time, as a correction with a reason. Never into BOQ or Pricing (use Request BOQ change), and not while a BOQ or pricing request is open. |
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
| A resale deal turns out to need a solution design | **Involve presales** (More) | Presales gets the deal with the reason; see "Bringing presales in later". |
| Customer or sales changes the scope | **Request BOQ change** (More) | Presales gets revision N+1 with the reason. Pricing in progress is stopped and the deal returns to BOQ. Only the lines presales change go back to purchase. |
| Presales needs information | **Ask sales a question** (More) | Sales sees **Answer presales**. The presales due date pauses while waiting. |
| Purchase cannot price a line (end-of-sale part, wrong SKU) | **Send back to presales** (More) | Presales gets a high-priority revision and the deal returns to BOQ. |
| Customer wants a different price | **Send revised quote** | Re-price at a new margin in the same dialog. The old quote version is superseded. |
| A supplier price has lapsed | **Re-validate costs** | Purchase re-confirms the lines whose price lapsed (every purchase line, if none has). Quoting is blocked until then. |
| Own-brand work is subcontracted | Set the line to **Source via purchase** | Purchase prices it with the other bought-in lines. |
| Someone is away | **Reassign** (More) | The new owner is notified. |
| Work no longer needed | **Cancel request** (More) | A reason is required, and the assignee is told to stop. |
| Deal closed or put on hold | Automatic | Anyone still working on it is told to stop or pause. |

## Safeguards

- Only one BOQ request and one pricing request can be open per deal.
- Products and quantities are locked while purchase is pricing. While presales is working, only the assigned engineer can change them.
- If two people edit the line items at once, the second save is rejected instead of overwriting the first.
- A purchase line whose product, quantity or term changes after it was costed is marked **needs re-pricing**, and the deal cannot be quoted until purchase confirms it. Moving a line to or from purchase is treated the same way.
- Quotes need every line costed (by purchase, the rate card or presales), no estimate lines, a real OEM on every line, and no lapsed supplier price on any line.

## Automatic reminders

| When | Who is notified |
|---|---|
| A BOQ or pricing request is due within a day | The person it is assigned to |
| A BOQ or pricing request is overdue | That person, the sales owner and their manager |
| A presales question has gone unanswered for 2 days | The sales owner |
| A quote expires within 3 days | The sales owner |

The rules are in `src/lib/workflow.ts` (unit-tested), the actions in `src/server/actions/workflow.ts`, and the status line in `src/components/opportunities/deal-status.tsx`.

## Line items

The Line items tab shows the BOQ as a clean read-only table, grouped by business unit with subtotals. Each row shows the item, quantity, billing, unit price and amount; cost and margin columns appear for people who can see cost, with where each cost came from (Purchase with its validity, Rate card or Presales) or who it is waiting on. Estimates, lapsed supplier prices and lines that need re-pricing are marked.

Each person's button opens edit mode with only the fields they may change:
- **Edit line items** for presales and the deal owner (products and quantities, and the owner's prices);
- **Enter costs** for purchase (purchase lines: cost, distributor, validity) and for presales when only costs are open to them (own-brand lines);
- **Set prices** when only prices can be changed.

**Save** or **Cancel** returns to the read view. Links from the presales and purchase work queues open straight into edit mode.
