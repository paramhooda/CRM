# Sales process: BOQ → Pricing → Quote

Each team owns one pipeline stage. The CRM moves the deal to the next stage as each team hands over, so the stage always tells you who has the deal.

| Stage | Owner | Work | Hand-over (moves the deal on) |
|---|---|---|---|
| Qualified | Sales | Every opportunity starts here (leads carry the earlier qualification); add quick-estimate lines (BU, category, OEM or "To be decided", value if known) | **Request BOQ from presales** → BOQ |
| **BOQ** | Presales | Turn estimates into catalogue lines; attach the documents sales asked for | **Submit BOQ** → Pricing |
| **Pricing** | Purchase | Enter the purchase price of each third-party line, backed by the supplier's quote | **Pricing complete** → back to sales, still in Pricing |
| Pricing (priced) | Sales (deal owner) | Set the sales price of each line; ask for approval when a rule applies | **Create & send quote** → Proposal Submitted |
| Proposal Submitted, Negotiation | Sales | Follow up with the customer | **Record customer response**; mark **Won** with the PO |

Deals without presales are fine: sales can add lines and **Request pricing** directly, which moves the deal from Qualified to Pricing.

## What is asked, by whom, and when

Each person enters only what they know at their step. Everything else is derived.

| Step | Who | Asked for | Derived, never typed |
|---|---|---|---|
| **New deal** | Sales | Account, customer contact (required), name, expected close, next step; what's being sold as business unit → category → OEM, with a value if known (one-time or recurring with a term; categories that usually bill monthly, such as hosting, NOC and SOC, start as recurring); presales yes / no; procurement (bid date for RFP / tender); deal registration (only for OEMs that run it). Lead source, competition and notes are optional, under More details. | Account type (from the account), deal type (new business for a new logo; for an existing customer renewal, upsell or cross-sell from what they already bought; correctable on the edit form), stage (Qualified), probability, forecast (Pipeline), revenue model, contract term and ARR (from the lines), owner (you) |
| **Request BOQ** | Sales | Customer requirement, needed by; under More options: presales engineer (auto-assigned otherwise), deliverables (BOQ, solution document, presentation, site survey, PoC / demo), sites when a survey is asked for | Presales owner, stage (BOQ) |
| **Submit BOQ** | Presales | BOQ lines (catalogue products), solution summary, **the documents sales asked for (required)**, assumptions and exclusions; the cost of own-brand lines not on the rate card | The BOQ itself (generated from the line items, never uploaded), each line's cost source, which lines purchase must price, rate card costs, the purchase person (assigned automatically), stage (Pricing) |
| **Pricing** | Purchase | Purchase price, supplier and validity per third-party line, and **a supplier or OEM quote for every line priced** (one quote can cover several lines) | The earliest validity |
| **Sales prices** | Sales (deal owner) | The sales price of each line, or a GM % per line or per business unit; rate card items start at their rate card price | GM per line, contract GM, monthly GM, deal value, whether approval is needed |
| **Quote** | Sales (deal owner) | Validity, terms | Deal value, stage (Proposal Submitted) |
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

A resale deal brings presales in through **Involve presales** (not the edit form), so there is always an engineer and a due date. Going the other way, **Skip BOQ** (from inside the BOQ stage) turns a solution deal into a resale deal.

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
| **Rate card** | Own-brand (Progression, Neon Cloud) catalogue items with a standard cost, in a **rate card category**: Cloud, NOC and SOC | Nobody: the catalogue's standard cost is applied automatically | No |
| **Presales** | Own-brand items in any other category (professional services, FMS, AMC, compliance…), own-brand custom lines, and items presales re-costs for this deal | Presales, with a short note on how it was costed | No |

- An admin marks the own brands under Settings → Picklists → OEMs → **Own brand**, and the rate card categories under Settings → Business units and categories → **Rate card** (today all of Cloud, plus NOC and SOC).
- The cost is called **Purchase price** on purchase lines and **Internal cost** on rate card and presales lines, everywhere it is shown.
- Third-party lines are always costed by purchase. **Rate card items are always costed from the rate card: nobody types or changes their cost**, not presales and not purchase. A lower price for the customer is a sales discount, which the approval rules can send for approval. Other own-brand lines are costed by presales, or sent to purchase (**Bought in? Send to purchase**) for subcontracted work such as back-to-back AMC.
- A device-based SOC or NOC rate card is a catalogue product priced per device, so it is costed from the rate card like any other.
- Lines presales re-costed before the rate card was locked (1.6.0) keep their cost until the line's product, quantity or term changes.
- Each purchase line carries its own supplier's validity, because one deal often has prices from several distributors. Purchase sets it on the line; the date given at **Pricing complete** fills any line without one. **Re-validate costs** sends back only the lines whose price has lapsed.
- **Every price purchase enters is backed by a quote.** At Pricing complete, each third-party line priced in that request (entered, confirmed unchanged, or renewed) needs a supplier or OEM quote attached to the request; one quote can cover several lines, ticked in the dialog ("covers line 1 2 3"). Rate card, presales-costed and own-brand bought-in lines need none. The Documents tab shows which lines each quote covers.
- Presales must enter the cost of own-brand lines before submitting the BOQ. A deal with only own-brand lines skips purchase altogether.
- Sales sees where each cost came from on Line items: Purchase price (with validity and distributor), Internal cost · rate card or Internal cost · presales, or who it is still waiting on.

## Sales prices, GM and approvals

Once purchase has priced the BOQ (or straight away when every line is costed internally), the deal owner sets the sales prices and sends the quote.

1. **Create & send quote** (the advance to Proposal). One table: each line's purchase price or internal cost, the sales price, GM % and GM. Rate card items start at their rate card price. Typing a GM % sets the price from the cost, and a GM can be applied to a whole business unit at once. The totals show the contract value, cost, **contract GM** (one-time lines plus recurring lines over their term) and, for recurring lines, **monthly GM**. A loss shows in red.
2. **Approval, when a rule applies.** As prices are typed, the table shows whether an approval rule catches them ("GM 8.4% is below 10%", "Rate card discount on line 3", "Deal value ₹1.2 Cr is ₹1 Cr or more"). Then the button reads **Ask for approval**: the prices are saved and the first approver is notified. Each approver gets "Approve the prices" on their home page, reviews the lines, GM and reasons, and **approves** or **sends back** with a note. Steps run in order; when all have approved, the owner is told "Prices approved: send the quote".
3. **Send.** With no rule caught, or once approved, the owner sets the validity and terms and sends. The approval covers exactly those lines and prices: any change afterwards (price, quantity, cost, a new line) needs a new approval.

**Approval rules** (Settings → Approvals, admins). None exist until an admin adds them; without rules, quotes go out without approval. Each rule has:
- conditions, all of which must hold: contract GM below a percentage; a rate card item priced below its rate card price; deal value at or above an amount; and optionally only deals with lines in chosen business units. Several rules give "or".
- approvers in order: the deal owner's manager, any Sales Head, any Admin, or a named sales head or admin. One person approves each step.
- When several rules apply, their approvers are combined in rule order, each once.
- Nobody approves their own prices: a step whose only approver asked for the approval passes on its own (recorded). A step nobody can approve (no manager set, a person who left) goes to the admins.

Rules:
- Sales prices can only be set when no BOQ or pricing work is open and every line has a current cost. On Line items, prices aren't edited; they are set in this step.
- Prices are saved against the BOQ version that was open. If someone changed the lines in between, the save is refused with a reload message.
- The deal owner or a manager sends quotes, records the customer's response and extends a quote's validity.
- Every approval request and decision is on the History tab.

## Revisions follow the same path

When the owner asks for a BOQ change, involves presales, or requests re-pricing or re-validation after a quote went out, **the deal moves back to BOQ or Pricing** (recorded in the stage history) and goes forward the usual way. The quote stays with the customer until the revised one replaces it.
- When the revision comes back, the status reads **Revised pricing ready · re-check the sales prices**, the home page shows "Re-priced: re-check the sales prices", and the pricing table marks each line: new since the quote, its quantity on the quote, and the price quoted.
- The revised quote (with any approval it needs) brings the deal back to Proposal Submitted.
- A revision that changes nothing the customer sees (costs re-confirmed, validity renewed) returns the deal to where it was with that quote.

## Stage rules (enforced for everyone)

The stage bar works like Salesforce Path:
- **The stages show progress only and cannot be clicked.**
- **One button advances the deal to its next stage.**
  - Into BOQ, Pricing and Proposal Submitted, the advance *is* the hand-over: **Advance to BOQ** opens the BOQ request, **Advance to Pricing** opens Submit BOQ (presales) or Request pricing (resale deals), and **Advance to Proposal** opens Create & send quote (or Ask for approval when a rule applies).
  - Elsewhere it moves the deal directly: Advance to Negotiation, and **Close as won** from Negotiation.
  - When the next step belongs to someone else, the button is disabled and says who it is waiting on.
- **Resale deals have their own path without BOQ**, the way Salesforce gives each sales process its own stages.
- **More** holds the rest: Put on hold, Move back one stage (managers), Skip BOQ (only while in BOQ), Close as won (from Proposal Submitted), Close as lost, Drop, Reopen (managers).

These rules apply to the stage bar, the pipeline board and the edit form, and the server checks them again on every change.

| Move | Who | Rule |
|---|---|---|
| New deal | Sales | Starts at **Qualified** (there is no Identified stage: leads carry the earlier qualification). Needs the customer contact. The value may be left blank: it comes from the sales prices, and the deal shows "Set at pricing" until then. |
| → BOQ, → Pricing, → Proposal Submitted | Nobody by hand | Set by the workflow: request a BOQ, submit the BOQ (or request pricing), send the quote. |
| Proposal Submitted → Negotiation | Owner or manager | Needs a quote with the customer and nothing open with presales or purchase. |
| → Won | Owner or manager | Only from Proposal Submitted or Negotiation, with nothing open with presales or purchase. The latest quote must be with the customer or accepted (**not** one they asked to change), the deal's lines must still match it, and it must not have expired. Lines must be priced with HSN/SAC. The customer's PO number **and the PO document** are required; a PO number can close only one deal. |
| → Lost / Dropped | Owner or manager | From any open stage, with a loss reason. |
| Skipping a stage | Owner or manager | Only from inside the stage, with a reason. Today that is BOQ: **Skip BOQ (no presales needed)** cancels any open BOQ request, makes it a resale deal and moves it to Pricing. Nobody can jump ahead from an earlier stage. |
| Moving back | Sales manager only | One stage at a time, as a correction with a reason. Never into BOQ or Pricing by hand: a BOQ change or re-pricing request moves the deal back there itself (see "Revisions follow the same path"). |
| Hold | Owner or manager | Needs a reason. While on hold, the only moves are **Resume**, Lost or Dropped. See "On hold" below. |
| Reopen a closed deal | Sales manager only | Needs a reason. Returns to the stage it was closed from. The PO, loss reason and notes are cleared (the history keeps them). If the close date has passed, a new one is asked for. |

Other rules:
- **Probability** follows the stage and is not edited by hand, so the weighted pipeline is comparable across deals.
- **Commit** is allowed only once the quote is with the customer (Proposal Submitted or Negotiation).
- Closed and on-hold deals are omitted from the forecast.
- A changed close date or next-step date cannot be in the past.
- **Closed deals are read-only.** Only a sales manager can edit them, for corrections (for example a PO number typo on a won deal). A closed deal's account can't change.
- **Win rate** is Won ÷ (Won + Lost) on every page. Dropped deals (cancelled, duplicates) are not losses.
- **The edit form never changes the stage.**
- Every stage change is recorded with who made it and why (hold reason, correction reason, PO or loss reason). The reason shows in the stage journey on the History tab.

## Quotes and the PO

- A quote records the lines as the customer saw them (part, description, quantity, unit, term, price, GST). While the deal's lines still match, the quote stands. When anything the customer would see changes, the status says **send a revised quote**, and neither **Accepted** nor **Won** can be recorded against the old one. Cost changes don't count: they are internal.
- A quote can't be valid longer than the earliest supplier price behind it.
- **Extend quote validity** gives the customer more time on the same quote, as long as nothing changed and the supplier prices still hold. Otherwise purchase re-validates the costs first.
- Sending a revised quote replaces every earlier quote, accepted ones included, so there is only ever one quote to accept.
- Closing as won accepts the quote that went out and freezes the lines for billing. The customer's PO is attached in the same dialog (or already on the Documents tab).
- The printed quote charges each line's own GST rate.

## On hold

- Putting a deal on hold tells presales and purchase. **Reminders and escalations stop**, and their work doesn't count as overdue. They can still finish and submit what they are working on.
- Sales can't send a quote or raise a new request on a held deal.
- **Resume** moves every open request's due date out by the time the deal was on hold, restores the forecast category the deal had, and asks for a new close date if it passed. If presales submitted the BOQ while the deal was held, it resumes in Pricing.

## Leads

- **Convert** works for any open lead (not one marked Unqualified), once: a second attempt is refused.
- It reuses an existing account with the same name only if it is one you can see. Otherwise it tells you who owns it.
- It reuses the contact when the person's email is already known at that account. An email that belongs to another company stops the conversion and says where.
- You choose the category from any business unit and whether the deal needs presales (defaulted from the category).
- Saving a lead whose email matches an open lead or a contact shows a warning.

## People leaving or changing role

Deactivating someone, or changing their role, while they still own deals, have open requests (assigned to them or raised by them), support deals as presales or purchase owner, or own open leads, needs a **Hand over to** person in the same line of work. Everything moves in one step; the successor is notified and it is on the audit log. Deactivated people get no more notifications.

## Contacts on deals

- A deal's primary contact must belong to the deal's account.
- Deleting a contact removes them from the buying group of open deals and clears them as primary contact there. Closed deals keep their record.
- A contact on open deals can't be moved to another account. Add them at the new company as a new contact.
- Moving an open deal to another account removes the old company's people from its buying group.

## Presales and purchase see their work only

Presales and purchase do not see the funnel. Their menu is **My work**, their **requests** and the **product catalogue**; pipeline, pipeline review, reports, accounts, contacts, leads, the deal list and exports are for the sales team, and opening one takes them back to My work.

They can open only the deals they are, or were, assigned to (as presales or purchase owner, or on a BOQ or pricing request). On those deals they see:
- the stage path and status line, with only the steps that are theirs (for example **Submit BOQ**);
- their request and its due date, the sales owner, the other team's owner, and the bid or close date;
- **Line items** with specification and cost, never sell prices, deal value or margin;
- **Documents**, **Requests** (what was asked, revisions, questions, send-backs), and for presales the customer's **Contacts**.

Quotes, forecast, health, activity and the audit trail stay with sales. The server leaves the sell side out of what it sends them, so it is not just hidden on screen.

## Documents

Each deal has a **Documents** tab. Files are stored with the deal, up to 15 MB each: PDF, Word, Excel, PowerPoint, CSV, text, images, email (.msg, .eml) or zip.

| Kind | Added by | Seen by |
|---|---|---|
| Customer RFP / requirement | Sales | Sales, presales, purchase |
| Customer PO | Sales | Sales |
| Statement of work | Sales, presales | Everyone on the deal |
| Solution document, presentation, site survey | Presales | Sales, presales |
| BOQ sheet | Presales | Everyone on the deal |
| Supplier quote, OEM quote | Purchase | Everyone on the deal |
| Other | Anyone | Sales, and whoever added it |

- **Attach right in the hand-over.** Each hand-over dialog has an optional **Attach documents** section:
  - **Request BOQ**: the customer's RFP or SoW. An RFP/tender deal with no RFP on file shows a reminder.
  - **Submit BOQ**: the solution document, BOQ sheet, presentation or site survey. It reminds you of any deliverable sales asked for that isn't attached yet.
  - **Request pricing**: a BOQ sheet or OEM quote.
  - **Pricing complete**: the supplier and OEM quotes behind the costs.
  - **Close as won**: the customer's PO. This is the one document that is **required**.
- Documents attached in a dialog are linked to that request ("BOQ revision 2", "Pricing request"). So is a document added while someone works on a request.
- Documents already on the deal are listed in the dialog, so nobody uploads them twice.
- Whoever added a document can remove it while the deal is open; a sales manager can at any time. Adding and removing are on the History tab.

## What everyone sees on a deal

Under the stage path, one line says:
- where the deal is (for example "Pricing with purchase", "Priced · ready to quote", "Quote v2 with customer");
- who has it, and the due date (red when overdue);
- the one thing blocking it, if any.

On the right is **your** next action as a button. Less common actions sit under **More**. A sales manager sees the status and the sales-side actions (reassign, cancel, request a BOQ change). Presales and purchase work stays with the person assigned to it.

Below the status, three facts: **value**, **expected close** and **next step**. Then four tabs:
- **Overview**: next step, customer contact, team, and only the details that apply to this deal (bid date, deal
  registration, competition, PO, loss reason, notes). Concern flags show here when there are any. Links lead to
  **Activity & notes**, the **buying group** and the **history** (every request, revision, question, send-back and
  field change).
- **Line items**
- **Quotes**
- **Documents**

## Asking only what is needed

- **New deal:** account, opportunity name, expected close, and what's being sold. The customer contact is needed only
  to qualify the deal. Whether presales is needed is a Yes/No suggested from the categories. Everything else
  (procurement and bid date, deal registration, deal type, next step, lead source, competition, owner, notes) is
  under **More details**, which opens by itself if one of them needs fixing.
- **New lead:** name, company, email, phone and the requirement. The rest is under **More details**.
- **Hand-overs** show only their required fields, with sensible defaults:
  - **Request BOQ:** requirement and date. The presales engineer is assigned automatically: the deal's presales
    owner, otherwise whoever has the least open work. Picking someone, deliverables and attachments are under
    **More options**.
  - **Submit BOQ:** the solution summary.
  - **Request pricing:** the date.
  - **Pricing complete:** the validity date.
  - **Create & send quote:** a sales price (or GM %) per line, with a GM per business unit in one step; **Ask for approval** when a rule applies.
  - **Quote** (sales managers): validity; the terms are under **More options**.
  - **Close as won:** PO number, date and file.

  Reminders (a missing RFP or supplier quote) stay visible.

## Home page

- **First screen:** four numbers (open pipeline, commit and won this quarter, win rate) and **Needs your action**:
  one line per deal waiting on you, most urgent first. That covers answering presales, a quote expiring or accepted,
  the customer asking for changes, a priced deal to quote, a passed close date, an overdue next step, and a deal
  going cold. Managers see their team's.
- **Scroll down:** **Analytics**, with the filters (period, business unit, sales person and more), what needs
  attention, insights, forecast, trend, pipeline by BU/category/OEM, and the team leaderboard.

## When something changes

| Situation | Action | What happens |
|---|---|---|
| A resale deal turns out to need a solution design | **Involve presales** (More) | Presales gets the deal with the reason; see "Bringing presales in later". |
| Customer or sales changes the scope | **Request BOQ change** (More) | Presales gets revision N+1 with the reason. Pricing in progress is stopped and the deal returns to BOQ. Only the lines presales change go back to purchase. |
| Presales needs information | **Ask sales a question** (More) | Sales sees **Answer presales**. The presales due date pauses while waiting. |
| Purchase cannot price a line (end-of-sale part, wrong SKU) | **Send back to presales** (More) | Presales gets a high-priority revision and the deal returns to BOQ. |
| Customer wants a different price | **Revise sales prices** (owner), then **Send revised quote** (manager) | Re-price line by line in the same table. The old quote version is superseded. |
| A supplier price has lapsed | **Re-validate costs** | Purchase re-confirms the lines whose price lapsed (every purchase line, if none has). Quoting is blocked until then. |
| Own-brand work is subcontracted | Set the line to **Source via purchase** | Purchase prices it with the other bought-in lines. |
| Someone is away | **Reassign** (More) | The new owner is notified. An overdue request needs a new due date for them. |
| A due date can't be met | **Change due date** (More) | The requester, assignee, deal owner or a manager sets a new date with a reason. The other side is told and reminders restart. |
| The customer needs more time on a quote | **Extend quote validity** (More) | Same quote, later date, while nothing changed and supplier prices hold. |
| Work no longer needed | **Cancel request** (More) | The deal owner or a manager, with a reason. The assignee is told to stop. Cancelling **Involve presales** before any BOQ was submitted makes the deal resale again. |
| Deal closed or put on hold | Automatic | Anyone still working on it is told to stop or pause. |

## Safeguards

- Only one BOQ request and one pricing request can be open per deal.
- Products and quantities are locked while purchase is pricing. While presales is working, only the assigned engineer can change them.
- If two people edit the line items at once, the second save is rejected instead of overwriting the first.
- A purchase line whose product, quantity or term changes after it was costed is marked **needs re-pricing**, and the deal cannot be quoted until purchase deals with it: enter the new cost or validity, or tick **Price unchanged for the new spec**. Saving the line without doing either keeps it pending, and **Pricing complete** waits until every changed line is done. Moving a line to or from purchase is treated the same way.
- Re-pricing also sends back any purchase line whose supplier price has lapsed. **Pricing complete**'s date renews only lines in that request, never a lapsed line outside it.
- Two clicks or two people can't create the same request, quote or stage change twice.
- Dates picked in forms mean the end of that day in India, so a request due on the 15th isn't overdue that morning.
- Quotes need every line costed (by purchase, the rate card or presales), no estimate lines, a real OEM on every line, and no lapsed supplier price on any line.

## Automatic reminders

| When | Who is notified |
|---|---|
| A BOQ or pricing request is due within a day | The person it is assigned to |
| A BOQ or pricing request is overdue | That person, the sales owner and their manager |
| A presales question has gone unanswered for 2 days | The sales owner |
| A quote expires within 3 days | The sales owner |

Reminders run every 15 minutes, whether or not anyone has the CRM open, and skip deals on hold.

The rules are in `src/lib/workflow.ts` (unit-tested), the actions in `src/server/actions/workflow.ts`, and the status line in `src/components/opportunities/deal-status.tsx`.

## Line items

The Line items tab shows the BOQ as a clean read-only table, grouped by business unit with subtotals. Each row shows the item, quantity, billing, sales price and amount; the cost column (Purchase price, Internal cost, or both when mixed) and GM appear for people who can see cost, with where each cost came from (Purchase price with its validity, Internal cost · rate card or Internal cost · presales) or who it is waiting on. The totals show the contract GM and, for recurring lines, the monthly GM. Estimates, lapsed supplier prices and lines that need re-pricing are marked.

Each person's button opens edit mode with only the fields they may change:
- **Edit line items** for presales and the deal owner (products and quantities, and the owner's prices);
- **Enter costs** for purchase (purchase lines: cost, distributor, validity) and for presales when only costs are open to them (own-brand lines);
- **Set prices** when only prices can be changed.

**Save** or **Cancel** returns to the read view. Links from the presales and purchase work queues open straight into edit mode.
