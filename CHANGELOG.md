# Changelog

Each release says what changed, what happens to existing data, and any steps needed to upgrade.

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
