# Changelog

Each release says what changed, what happens to existing data, and any steps needed to upgrade.

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
