# Progression CRM: product specification

This is what the CRM does and the rules it enforces. It is written from the owner's own description of the
product; where the owner's words were not available and the behaviour was taken from the previous version of the
application, the item is marked **[inferred]**. Everything built on this branch is built against this document.

## 1. Purpose

"A CRM that is functionally able like Salesforce, but it looks simple with minimalist and only required data and
fields." It is the internal CRM of Progression, a systems integrator and managed services provider, used by about
30 people. It tracks accounts, contacts, leads and deals; it runs the hand-over from sales to presales (BOQ) and to
purchase (pricing); it shows each team only what they need; and it gives sales management funnels by business unit,
Sub BU, OEM, product and sales person, plus a page for running pipeline review calls.

"Use best practices and industry standard conventions for a typical Systems Integrator / Managed Services
Provider." "Keep only basic stuff that is required."

## 2. Who uses it

| Role | What they do | What they see |
|---|---|---|
| **Sales** (account manager, deal owner) | Creates accounts, contacts, leads and deals; pulls presales into a deal; asks purchase for pricing; sets sales prices; sends the proposal; closes the deal. "Sending the quotation is the role of the deal owner." | Their own records only. |
| **Sales Head** (manager) | Everything a sales person does, for their team; reviews pipelines; approves prices when an approval rule applies; can move a deal back a stage or reopen a closed one. | Their team's records (everyone who reports to them, directly or indirectly). A Sales Head with no reports sees every sales person. |
| **Presales** | "Presales would be required to fill in BOQ." Builds the bill of quantities on deals assigned to them: refines the lines (products, quantities, terms) and can ask purchase for pricing. | Only the deals they are assigned to, and only the technical side: lines, quantities and costs. Never the sales price, margin, forecast, funnel or dashboards. "Their role is not sales or opportunity building." |
| **Purchase** | "Purchase should be notified to get pricing." Enters the purchase price (unit cost) on the lines of deals where a pricing request is assigned to them. | Only those deals, and only lines and costs. Never sales prices, margin, forecast, the funnel or the customer's PO. |
| **Admin** | Manages users and roles, master data (lookups and the product catalogue), approval rules; sees the audit log and everything else. | Everything. |

Finance is not a user. Closed-won lines are stored so that "later on it is easy to add an API to send billable
data to finance"; nothing is built for finance now.

Sign-in is by email and password. The login is structured so that Microsoft 365 sign-in can be added later without
changing the data model.

## 3. Glossary

- **Account:** a customer or prospect company. Has a GSTIN (unique), industry, segment and an owner.
- **Contact:** a person at an account. Email is unique across contacts.
- **Lead:** an unqualified enquiry (company, person, source, interest). Converted once into an account, a contact
  and a deal.
- **Deal (opportunity):** a sale being pursued at an account, owned by one sales person, in exactly one stage.
- **Line (opportunity line):** one item sold on a deal: a catalogue product or a custom item, with quantity, revenue
  model, sales price and purchase cost. Every line carries its business unit, Sub BU and OEM, so funnels can be cut
  "BU wise, category wise, OEM wise, product wise".
- **Business unit (BU) → Sub BU:** IT Infrastructure, Cloud, Services, Cybersecurity, each with its Sub BUs
  (IT Infrastructure: Server, Storage, Laptop, Desktop, Workstation, Licence, Networking, Others. Cloud: Hosting,
  Managed Hosting, DRaaS, Colo, Public Cloud, Licence. Services: FMS, NOC, AMC, Professional Services, Backup as a
  Service. Cybersecurity: SOC, Licence, Compliance.)
- **OEM:** the vendor of what is sold. Its own list; "OEM is not mapped to BU".
- **Own IP:** the OEM is Progression or Neon Cloud. "There's no separate field for it." **[inferred]** The OEM
  record carries an *Own IP* flag the admin can set, so the rule survives a rename.
- **Sales method:** B2B, MoQ or Stock. "Applies only when the OEM isn't Progression or Neon Cloud."
- **Revenue model:** One-time, or ARR (annual recurring, with a term in months).
- **Forecast category:** Commit, Upside, Pipeline.
- **Customer segment:** Enterprise, Mid-market, SMB, Government/PSU.
- **Lead source:** OEM Referral, Distributor Referral, Existing Customer, Inbound, Outbound, Tender, Event.
- **GM (gross margin):** sales price minus purchase cost, as a percentage of sales price.

## 4. The sales process

Stage and status are one field. "User should only be permitted to behave as per system design… These steps
should follow a process flow, from stage to stage." "One click to advance deal to next stage. Sometimes a stage
might need to be skipped, but that skip should happen after reaching that stage."

| Stage | Who works it | To advance (the gate) |
|---|---|---|
| **Qualified** | Sales | Every new deal starts here ("opportunity created means by default it is qualified"; there is no Identified stage because "there was no difference between identified and qualified"). Needs a primary contact and a close date that is not in the past. If the deal needs presales, advancing creates the presales request and moves to BOQ; otherwise it goes straight to Proposal Submitted. |
| **BOQ** | Presales | "BOQ is a pre-sales role." Presales refines the lines and submits the BOQ. Skip BOQ is offered only here, for a deal that turns out not to need presales. |
| **Proposal Submitted** | Sales | Reached only when every line has a sales price, no presales or pricing request is open, and any approval the rules ask for has been given. "Upon pricing, sales will add margin and create & send quote." |
| **Negotiation** | Sales | Advance from Proposal Submitted. |
| **Closed-Won** | Sales | From Proposal Submitted or Negotiation, with the customer's PO number and the PO file attached. |
| **Hold** | Sales | From any open stage, with a reason. Resume returns the deal to the stage it was held from. |
| **Closed-Lost / Dropped** | Sales | From any open stage or Hold, with a reason from the loss-reason list. Dropped is not a loss (it does not count against win rate). |

Also:
- **Back** one stage (managers only, with a reason). **Reopen** a closed deal (managers only) returns it to its last
  open stage.
- Nobody can jump stages or click a stage to land on it. The server re-checks every move; the UI only offers the
  moves that are allowed and says why the others are not.
- Every stage change records who made it, when, the reason, the deal value at that moment and the days spent in the
  previous stage, so time-in-stage can be reported.
- Closed deals are read-only.

**Commit**, **Upside** and **Pipeline** are set by the sales person. A deal in Commit that has not reached Proposal
Submitted is flagged in pipeline review. **[inferred]**

## 5. Hand-offs

**Presales request** (sales → presales). Created when a deal that needs presales advances into BOQ, or raised by
hand while the deal is in Qualified or BOQ. It names the engineer, a due date and the scope. Presales starts it,
edits the lines, and submits it with a short summary. The deal's *presales owner* is the engineer on the latest
request. Whether a deal needs presales is suggested from the Sub BUs on its lines (each Sub BU has a *needs presales*
flag an admin maintains) and can be changed by sales. "When I select no pre-sales required, it must not ask me to
send to pre-sales."

**Pricing request** (sales or presales → purchase). Raised on a deal in Qualified or BOQ with a buyer, due date and
notes. Purchase starts it, enters the unit purchase cost on every line that is not own IP, and completes it. Own-IP
lines take the product's standard cost by default; presales may enter their cost. "Sales will add pricing per
product after getting prices from Purchase."

Only one presales request and one pricing request can be open on a deal at a time. Either can be cancelled or
reassigned by the person who raised it or a manager. Presales and purchase see their open requests, overdue first,
on their **My work** page: "easy to come online and see what work they have to do. They don't need to see any fancy
numbers."

## 6. Lines and money

- A deal has one or more lines. A line is a catalogue product (which fixes BU, Sub BU and OEM) or a custom item
  with those three chosen by hand.
- Per line: quantity, unit, revenue model, term in months (ARR only), unit sales price, unit purchase cost, sales
  method (non-own-IP only), and *last updated*.
- Line value: one-time = quantity × unit price; ARR = quantity × unit price (annual) × term / 12.
  Annual recurring value = quantity × unit price for ARR lines.
- Line GM % = (unit price − unit cost) / unit price.
- Deal value = sum of line values. ARR = sum of annual recurring values. Deal GM % = (value − cost) / value, shown
  only when every priced line has a cost. The deal's primary BU and OEM are those of its largest line.
- Filtering deals by BU, Sub BU or OEM includes a deal if any line matches.
- Money is stored as a decimal with a currency (INR) and displayed in lakh and crore (₹48.6 L, ₹1.25 Cr).
- The fiscal year runs April to March; FY27 is April 2026 to March 2027. Deal codes are numbered per fiscal year
  (OPP-FY27-0042).
- Contract start and end dates belong in the ERP, not the CRM.
- **[inferred]** Presales owner and next step are tracked on the deal rather than on each line, because presales is
  engaged per deal. Each line keeps its own last-updated time.

## 7. Price approvals

"Allow admin to configure approval process. When deal owner tries to advance deal with certain margin, it should go
through approval chain. Create a template in admin page where I can define these approval workflows."

- An approval rule has conditions (deal GM below a percentage, deal value at or above an amount, a business unit)
  and an ordered list of approvers (the owner's manager, anyone in a role, or a named person). Every condition on a
  rule must hold for it to apply; several rules act as "or".
- When a rule applies, the owner asks for approval before advancing to Proposal Submitted. Approvers see it in their
  inbox and approve or reject with a note. Nobody approves their own request; a step with no other approver passes
  on its own.
- An approval covers exactly the lines and prices it was asked for. If a line's quantity, price, cost, model or term
  changes afterwards, the approval lapses and a new one is needed.
- With no rules defined, no approval is ever asked for. "We do rate to rate deals sometimes": there is no built-in
  minimum margin.

## 8. Leads

A lead captures the company, the person, the source, the business unit of interest and an estimated value. Statuses:
New, Contacted, Qualified, Converted, Disqualified (with a reason). **Convert** happens once and creates (or picks)
the account and the contact and creates the deal at Qualified.

## 9. Documents

Files can be attached to a deal with a kind: Customer RFP, SoW, Solution document, Supplier quote, Customer PO,
Proposal, Other. "Optional but may be required": the only document that is required is the **Customer PO at
Closed-Won**. Purchase and presales can attach supplier quotes and solution documents to deals they work on;
"customer PO" and "proposal" carry sales prices and are visible to sales roles only. Files are stored in the
database (up to 20 MB each).

## 10. Pipeline review

"I will use this in a team sales call, select the sales person, and review their funnel and their changes." The
review page takes a scope (one sales person, a manager's team, or everyone) and a start point (last review, 7, 14 or
30 days, quarter start, or a date) and shows every open deal with what changed since then (value, stage, close date,
forecast, owner) and flags that "must be brought to attention": close date passed, close date pushed, no activity
for 21 days, stuck in a stage longer than its norm, Commit without a proposal. For each person it shows what has
gone well (won, advanced, new pipeline) and what is lagging (pushed, past close, quiet deals, commit vs target).
**Mark reviewed** records the review with notes; "since last review" is tracked per person.

## 11. Home and analytics

Sales roles land on **Home**: "first glance should show numbers + todo", then "as we scroll down there should be
more analytics", and "analytics should be filterable". Numbers: open pipeline, commit this quarter, won this fiscal
year against target, win rate, average expected GM. To-do: approvals waiting on me, deals past their close date,
missing or overdue next steps, my overdue requests. Charts, filterable by period, BU, Sub BU, OEM and sales person:
funnel by stage, pipeline by BU, by OEM, by Sub BU, forecast split and (for managers) by sales person. "Dashboard
elements should be clickable and should take to the selected detailed view."

Presales and purchase land on **My work** instead and do not see the funnel.

## 12. Master data

Admins maintain: users and roles (and who reports to whom), business units, Sub BUs (with the *needs presales*
flag), OEMs (with the *Own IP* flag), lead sources, segments, industries, loss reasons, document kinds, sales
methods, the product catalogue (code, name, BU, Sub BU, OEM, unit, revenue model, default term, list price, standard
cost, HSN/SAC), approval rules and quarterly sales targets. Lookup values are deactivated, never deleted, so history
keeps its meaning. Changes show in dropdowns immediately.

## 13. Permissions

Every permission is enforced on the server on every route; hiding a button is never the control.

| | Admin | Sales Head | Sales | Presales | Purchase |
|---|---|---|---|---|---|
| Accounts, contacts, leads | all | team | own | read, on assigned deals | read, on assigned deals |
| Deals: read | all | team | own | assigned, technical view | assigned, technical view |
| Deals: create, edit header, stage moves, prices | ✓ | team | own | – | – |
| Lines: products, quantities, model, term | ✓ | team | own | assigned, while open | – |
| Lines: purchase cost | ✓ | – | – | own-IP lines | assigned, all lines |
| Back a stage, reopen, delete and restore | ✓ | team (not restore) | – | – | – |
| Presales / pricing requests | ✓ | team | own deals | start, submit (assignee) / raise pricing | start, complete (assignee) |
| Documents | ✓ | team | own | non-sales kinds on assigned deals | non-sales kinds on assigned deals |
| Approvals | decide when listed | decide when listed | request; decide when listed | – | – |
| Home dashboard, pipeline review | all | team | own | – | – |
| Users, master data, approval rules, audit log | ✓ | targets only | – | – | – |
| Export | same as the list | same | same | same, technical columns | same, technical columns |

A record outside someone's scope behaves as if it does not exist (404), whether reached through the UI or the API.

## 14. Audit and history

Every create, update, delete and restore is logged with who, when, the field, the old value and the new value.
Deal value, GM, stage, owner, forecast and close date changes are always field-level. Every deal shows its History:
stage changes with days in stage, and field changes. Admins can see the whole log.

## 15. Exports

Every list (deals, lines, accounts, contacts, leads, audit) exports what is on screen, with the same filters and the
same columns the viewer is allowed to see, as CSV (UTF-8 with BOM, opens directly in Excel; cells are protected
against spreadsheet formula injection). **[inferred]** Native .xlsx is not produced.

## 16. Non-functional

- **Security:** bcrypt-hashed passwords; database-backed sessions that expire (12 hours idle, 72 hours absolute)
  and are revoked on password or role change; ten failed sign-ins lock the account for 15 minutes; API writes need
  a custom header (CSRF); all input validated on the client and again on the server with field-level messages; no
  unhandled errors or blank screens; secrets in `.env`.
- **Data:** business-readable table and column names; permanent IDs; records link by ID; unique GSTIN and emails;
  soft deletes with admin restore; UTC timestamps; decimals for money; every schema change is a migration.
- **Look and feel:** the design system in `docs/DESIGN.md` (light, flat, quiet: Geist, zinc neutrals, a brand-blue
  scale, 1px borders, faint shadows, 36px controls, every colour, font, radius and shadow a token); shadcn/ui; one
  table, one form style, one empty state, one toast; loading and empty states on every screen; colour carries
  meaning (stage tags, forecast tags, a colour per BU) and nothing else is loud; light mode first, dark mode through
  the same tokens; WCAG AA contrast; tags always carry text.
- **Deployment:** one `docker compose up` (Postgres + app); migrations run on start.

## 17. Out of scope (deliberately)

Bundle pricing (one price for several lines); quote documents, versions and printing; supplier quotes tied to
lines; health scores and automated insights; email, notifications and SMTP settings; password-reset emails (an admin
resets passwords); backup and upgrade scripts; HTTPS termination; saved views; a command palette; an activities /
tasks module; competitor, distributor, deal-registration and procurement-mode fields; contract dates (ERP); native
Excel files; Microsoft 365 sign-in (prepared for, not built); anything for finance beyond keeping lines billable.

## 18. Assumptions

Each item marked **[inferred]** above, plus: demo data includes a second Sales Head with a smaller team so that team
scoping can be seen; "activity" on a deal means any recorded change to it; the kanban view is read-only (moves happen
on the deal page where the gates can be explained).
