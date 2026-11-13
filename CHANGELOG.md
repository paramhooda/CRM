# Changelog

Each release says what changed, what happens to existing data, and any steps needed to upgrade.

## 1.7.0: a clean BOQ editor, and one price for several lines

**Building the BOQ**
- Sales' quick-estimate lines (BU, category, OEM, value) are no longer rows in the editor. They show in a one-line **Sales estimate** box above the BOQ, as a reference.
- Presales builds the BOQ from scratch. The estimate is removed when the BOQ is handed on (**Submit BOQ**, or **Request pricing** on a resale deal; also when a quote is created or approval is requested), and History records what it said. Until then, the deal value comes from the BOQ lines once there are any.
- **Add product** adds a row with the catalogue search open. Picking a product moves to its quantity, and **Enter** adds the next product.
- Rows show only what matters:
  - the product;
  - the quantity, with the unit from the catalogue;
  - billing, only for recurring items;
  - how the line is priced;
  - remove.

  Custom lines keep their description, BU, category, OEM, HSN/SAC and unit fields.
- The line count no longer includes the estimate.

**One price for several lines (bundles)**
- A supplier can price a server with its extra memory and disks as one figure, or line by line, so the BOQ supports both, case by case.
- **↳ Add component** adds a part priced with a line. **Priced as** (Own price / With line N) groups or ungroups any third-party line. Presales sets it while building the BOQ, and purchase can regroup to match the supplier's quote.
- **Purchase** enters one cost on the main line ("Price for lines 1–3"). Included lines show "In line 1's price" and need no supplier quote of their own.
- **Sales** sets one sales price on the main line. The pricing step, the BOQ page and the printed quote list the included lines under it as **Included**.
- **Rules:**
  - one level only;
  - third-party lines only;
  - included lines bill like their main line.
- Changing a priced bundle sends the main line back to purchase. A line taken out of a bundle needs its own price.
- **Reporting and billing:** a bundle's value counts under its main line's OEM, category and BU. The billing export (`opportunity.won`) carries included lines at ₹0 with the new field `includedInLineNo`.

**Catalogue (demo data only):** server memory and NVMe SSD components were added to the seed catalogue.

**Data:**
- One new nullable column, `OpportunityLineItem.bundleLeadId`, with an index and a foreign key; it is set to null if the main line is deleted. Existing lines are not bundled and are unchanged.
- From now on, estimate lines are removed when a BOQ is handed on (submit, pricing request, approval request or quote). Deals already past that point keep any estimate lines they have until their next such step.
- A deal that has both estimate and BOQ lines gets its value from the BOQ lines only, recalculated the next time its lines change (before, both were added up).
- Existing quotes are unchanged.

**Upgrade steps:** none. The migration runs on start.

## 1.6.0: approval rules, quote-backed pricing, and one path for revisions

**Approvals**
- Admins define approval rules under Settings → Approvals. A rule applies when every condition set on it holds:
  - contract GM below a percentage;
  - a rate card item priced below its rate card price;
  - deal value at or above an amount;
  - optionally, only some business units.
- Each rule lists its approvers in order: the deal owner's manager, any Sales Head, any Admin, or a named person.
- When a rule applies, the owner asks for approval. Approvers approve or send back with a note, from their home page.
- The owner sends the quote once approved. Any later price or line change needs a new approval.
- Without rules, quotes go out as before.

**The owner sends the quote again.** The 1.4.0 step "sales prices → manager sends" is gone.

**New deals**
- Every opportunity starts at **Qualified**, and the Identified stage is retired.
- The customer contact is required. The value can wait until pricing.
- Deal type is no longer asked. It is worked out from the account and what the customer already bought, and can be corrected on the edit form.
- The Deal ID shows on the deal page.

**Line items**
- Edit mode shows each person only what they enter:
  - presales: products, quantity, billing, and the cost of own-brand lines off the rate card;
  - purchase: purchase price, supplier and validity;
  - sales: products and quantities.
- Rate card items (Cloud, NOC, SOC) are always costed from the rate card; nobody can change their cost.
- Rate card items start at their rate card price in the pricing step; a lower price is a discount that a rule can send for approval.

**Hand-overs**
- **Submit BOQ:**
  - the documents sales asked for (solution document, presentation, site survey) are required;
  - the BOQ is no longer uploaded: it is generated from the line items (Documents → Bill of quantities);
  - purchase is assigned automatically.
- **Pricing complete:** every third-party line priced needs a supplier or OEM quote; one quote can cover several lines. Rate card, presales-costed and own-brand lines are exempt.

**Revisions**
- A BOQ change, re-pricing or re-validation after a quote moves the deal back to BOQ or Pricing, and it comes forward the usual way.
- The owner sees "Revised pricing ready · re-check the sales prices", and each line shows what changed since the quote.
- A revision that changed nothing the customer sees returns the deal to where it was.

**Data:**
- Open deals at Identified move to Qualified, with a stage-history row, and held deals resume to Qualified.
- New tables (approval rules, price approvals, quote-to-line links) and a cost timestamp on line items start empty.
- Existing documents (old BOQ sheets included), costs, prices and quotes are unchanged.
- Rate card items that presales re-costed keep their cost until the line changes.

**Upgrade steps:** none. Add approval rules under Settings → Approvals if you want them.

## 1.5.0: a deal can start without a value; fixes from a full walk-through

**New deals**
- The value of each line is optional when the deal is created. A blank (or 0) means "not known yet".
- The deal shows "Not known yet · add value", and the home page lists "Add the estimated value".
- A deal can't move to Qualified until it has a value.
- A lead converted without a value starts the deal at Identified.
- Missing fields are marked on the form itself:
  - the account, name and close date, all at once;
  - for each line, its own message under it, with the first missing field focused;
  - the generic pop-up is gone.
- A category that usually bills monthly (hosting, NOC, SOC…) starts the line as recurring, 36 months.

**Fixes found by the walk-through**
- Pop-up messages appear at the top of the screen, no longer covering a form's main button.
- On a phone:
  - the pricing step shows one card per line, with the sales price and GM % in view;
  - the Quotes, Buying group and History tabs no longer scroll sideways.
- After a customer rejects a quote, the deal says so, with the next steps (close as lost, or re-price), instead of "BOQ changed".
- The close-as-lost and drop dialogs say what they do ("Close as lost", "Drop") instead of "Confirm".
- The pricing step:
  - catches a negative price on the form;
  - names who gets the prices when the owner has no manager.
- No more "ARR term missing" warning on a recurring deal that has no value yet.

**Data:** none. Existing deals keep their values; only new deals can be ₹0 until they are qualified. **Upgrade steps:** none.

## 1.4.0: sales prices and GM

**Pricing step**
- Once purchase has priced the BOQ, the deal owner sets the sales price of each line in one table. The table shows the line's purchase price (or internal cost), sales price, GM % and GM.
- Typing a GM % sets the price. One GM can be applied to a whole business unit.
- There is no minimum GM: rate-to-rate lines are fine.
- The owner hands the prices to their manager, who gets a notification and a "Prices set" item on their home page.
- Only sales managers send quotes. They see the same table and can change any price before sending.
- On Line items, the sales price of a costed line is now set only in this step.

**GM**
- Contract GM covers one-time lines plus recurring lines over their term.
- Monthly GM is shown for recurring lines.
- Both appear in the pricing table and on Line items.

**Labels**
- The cost reads **Purchase price** on purchase lines and **Internal cost** on rate card and presales lines.
- Unit price is now **Sales price**.

**Rate card**
- The rate card now applies only to Cloud, NOC and SOC. Other own-brand lines (professional services, FMS, AMC, compliance) are costed by presales.
- An admin can change this per category under Settings → Business units and categories → Rate card.

**Data:**
- New category flag `rateCard`, set for every Cloud category plus NOC and SOC.
- New deal field `pricesReadyAt`, empty for existing deals.
- On open deals, own-brand lines that took a rate card cost in any other category keep that cost, now as a presales cost marked "Was the rate card cost".
- Closed deals, quotes, prices and costs are unchanged.

**Upgrade steps:** none. Sales people who used to send quotes now set the prices and hand them to their manager.

## 1.3.0: simpler screens

**Deal page**
- Header shows value, expected close and next step only.
- Four tabs: Overview, Line items, Quotes, Documents.
- Overview lists only what applies to the deal. Activity, buying group and history are one click from it.

**Forms**
- A new deal needs account, name, close date and what's being sold. The rest is under More details.
- Presales is a Yes/No choice.
- The lead form is just as short.

**Hand-overs**
- Each dialog asks only what is required; the rest is under More options.
- The presales engineer is assigned automatically unless someone is picked.

**Home page**
- The first screen shows the numbers and a Needs your action list.
- Filterable analytics sit below.
- The opportunities list shows fewer columns by default; the rest can be switched on.

**Data:** none. **Upgrade steps:** none.

## 1.2.0: lead to closure, checked end to end

**Documents at every hand-over**
- Request BOQ, Submit BOQ, Request pricing and Pricing complete each have an optional **Attach documents** section.
  Files attached there are linked to the request.
- The dialogs remind you of a missing RFP (RFP/tender deals) or a deliverable that sales asked for, and list what is
  already on the deal.
- **Close as won needs the customer's PO document**, not just the number. Purchase can now see the customer's RFP.

**Won only against what the customer agreed**
- The CRM compares the deal's lines with the quote that went out. If anything the customer would see changed, the
  deal needs a revised quote before the customer accepts it or it is won.
- A quote the customer asked to change, or an expired one, can't be won.
- New **Extend quote validity** action. A quote can't be valid longer than the supplier prices behind it.
- One PO number closes one deal. The PO date must be real (not in the future, not more than a year ago).
- The printed quote uses each line's GST rate. Margin pricing rounds to the paisa.

**Pricing that can't go stale**
- A changed line must get a new cost from purchase, or a ticked **Price unchanged**. Saving it again doesn't
  confirm the old cost, and Pricing complete waits for every changed line.
- Re-pricing also sends back lapsed supplier prices. Pricing complete renews validity only for lines in that request.

**Dead ends removed**
- Request pricing appears whenever a line needs a cost, including after the customer asks for changes on a resale
  deal.
- A cancelled BOQ request can be raised again.
- Once the quote is accepted, the main button is Close as won.
- New **Change due date** action. Reassigning an overdue request asks for a new date.

**Hold pauses the clock**
- No reminders, escalations or overdue flags on held deals, and no quotes or new requests while held. Presales and
  purchase can still finish their work.
- Resume moves due dates out by the time on hold, restores the forecast, asks for a new close date if it passed, and
  lands in Pricing if the BOQ was submitted meanwhile.

**Leads, contacts, people**
- Converting a lead:
  - happens once;
  - reuses the contact with that email;
  - never attaches to an account you can't see;
  - lets you pick any category and whether presales is needed.
- Deleting a contact takes them off open deals. A contact on open deals can't be moved to another company.
- A deal's primary contact must be at its account. A closed deal's account can't change.
- Deactivating someone, or changing their role, while they have open work asks who takes it over, and moves it all.
  Deactivated people get no notifications.
- Managers can mark an account as an existing customer.

**Closing and reopening**
- Reopening clears the PO and loss reason. The forecast isn't Commit without a live quote.
- Closing also tells the owner's manager and records every changed field in the audit log.
- A reason from the list is required for Lost or Dropped. "Duplicate" was added.
- Managers can correct a PO number on a won deal without reopening it.
- Win rate is Won ÷ (Won + Lost) on every page.
- Reminders run every 15 minutes even when nobody has the CRM open.

**Data:** additive only:
- `OpportunityLineItem.needsReprice` (default false). Lines already waiting on a new cost with an old one kept are
  set to true, so purchase confirms them.
- `PresalesRequest.involved` (default false).
- A "Duplicate" drop reason.

Existing quotes without recorded lines (very old or imported) keep the previous check. New quotes record GST per
line.

**Upgrade steps:** none.

## 1.1.0: production basics

**Sign-in and accounts**
- Ten wrong passwords lock an account for 15 minutes. Administrators see a Locked badge and an Unlock button. Failed
  sign-ins are in the audit log.
- Passwords set by an administrator are temporary: the user chooses their own at the next sign-in.
- "Change password" is in the account menu.
- With email set up: "Forgot password?" on the sign-in page, and invitation links for new users.
- Changing a password or role, or deactivating someone, signs them out on every device.
- Contacts can only be edited and deleted by people who can see their account. Deleting needs the account owner, the
  person who added the contact, or a manager.

**Working together**
- Two people editing the same deal: the second save is refused with "X changed this deal at 14:32 …" instead of
  silently overwriting. Changes by purchase (costs, validity) also make an open BOQ editor reload before saving.
- Double-clicking Submit BOQ or Pricing complete can no longer run it twice.
- Errors show a plain message. Unexpected ones show a reference code that is logged on the server.

**Administration**
- Settings → Email & system: SMTP settings with a test button (the password is stored encrypted), plus version,
  database and last-backup status.

**Running it**
- Nightly database backups (14 days) plus an automatic backup before any database upgrade.
- `deploy/upgrade.sh`, `scripts/restore.sh`, `scripts/backup-now.sh`, `scripts/create-admin.sh`.
- Optional HTTPS with an automatic certificate (`--profile https`). Cookies become Secure automatically over HTTPS.
- The server refuses to start without a proper `SESSION_SECRET`.
- Logs are rotated. Dependencies and Node 22 are pinned.
- CI checks that migrations are additive and that the schema has no unmigrated changes.

**Data:** additive only. Users get `sessionVersion`, `mustChangePassword` and `lockedUntil`, which default to
"signed in as before", "no forced change" and "not locked". Deals get `version` (starts at 0). There are new tables
for sign-in attempts and reset links. No existing record changes, and everyone stays signed in.

**Upgrade steps (existing installs)**
- `POSTGRES_PASSWORD` is now required in `.env`. If you never set one, the database was created with
  `crm_local_only`: put `POSTGRES_PASSWORD=crm_local_only` in `.env`, or the app cannot reach the database.
- Demo data and demo sign-in are now **off** by default. A test server that should keep them needs
  `SEED_DEMO_DATA=true` and `DEMO_LOGINS=true` in `.env`.
- `COOKIE_SECURE` can be removed. The new default `auto` does the right thing over HTTP and HTTPS.
