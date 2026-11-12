# Running Progression CRM

A plain-language runbook for whoever looks after the CRM. All commands run on the server, in the folder that holds
`docker-compose.yml`.

## 1. First install

1. Install Docker Engine with the Compose plugin (Ubuntu: `curl -fsSL https://get.docker.com | sh`).
2. Get the code: `git clone <repo> crm && cd crm`.
3. Create `.env`:
   ```bash
   cp .env.example .env
   sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
   ```
   Keep this file safe. It holds the database password.
4. Start: `docker compose up -d`. The first start takes 5 to 10 minutes.
5. Create the first administrator:
   ```bash
   scripts/create-admin.sh admin@yourcompany.com "Your Name"
   ```
   It prints a temporary password. Open `http://<server address>:3000`, sign in, and choose your own password when
   asked. Then add everyone else under **Settings → Users & roles**.

A **test** install with sample data instead: set `SEED_DEMO_DATA=true` and `DEMO_LOGINS=true` in `.env` before step 4.
Every demo user has the password `Progression@123`.

## 2. HTTPS on your own domain (optional)

The CRM works on a plain `http://<address>`. To serve it as `https://crm.yourcompany.com` with a free certificate:

1. Point the domain's DNS (an A record) at the server. Open ports 80 and 443 in the firewall.
2. Add to `.env`:
   ```
   DOMAIN=crm.yourcompany.com
   APP_PORT=127.0.0.1:3000
   TRUST_PROXY=true
   ```
3. `docker compose --profile https up -d`

From then on always start with `--profile https`. Cookies switch to Secure and browsers are told to stay on HTTPS
automatically. To go back to plain HTTP, remove those three lines and run `docker compose up -d`.

## 3. Email (optional)

Under **Settings → Email & system**, enter the SMTP server details your email provider gives you:
- Microsoft 365: `smtp.office365.com`, port 587, STARTTLS.
- Google Workspace: `smtp.gmail.com`, port 587, STARTTLS, with an app password.
- Zoho: `smtp.zoho.in`, port 587, STARTTLS.

Then enter the From address and the CRM's web address. Click **Send test**, then **Save**.

With email on:
- users can reset a forgotten password themselves;
- new users can be added without a password, and get an invitation link.

Without it, an administrator resets passwords under Users & roles.

The SMTP password is stored encrypted and never shown again.

## 4. Backups

- **Automatic.** Every night at 01:30 the `backup` service saves the whole database to the `backups` volume, and
  keeps 14 days. Change the time and retention with `BACKUP_TIME` / `BACKUP_KEEP_DAYS` in `.env`.
- **Before every upgrade.** If a new version changes the database, the app saves a `pre-upgrade-…` backup before
  touching anything. If that backup fails, the upgrade does not run.
- **On demand:** `scripts/backup-now.sh`
- **See them:** `scripts/restore.sh` (with no file name). **Settings → Email & system** also shows the latest one;
  it turns red if it is more than 2 days old.
- **Off the server.** A backup on the same disk doesn't help if the server is lost. Once a week, copy the latest
  dump somewhere else:
  ```bash
  docker compose cp backup:/backups ./backups-copy   # then copy ./backups-copy to another machine or cloud storage
  ```
  Keep `session_secret.txt` from the same folder with it. Without it, saved settings such as the email password must
  be re-entered after a restore, and everyone signs in again.
- **Restore:** `scripts/restore.sh <file>`. It asks for confirmation, saves the current data first, then replaces it.
- **Practise once a quarter.** Restore last night's backup on a test machine and check that it opens.

## 5. Upgrading

```bash
deploy/upgrade.sh          # latest version
deploy/upgrade.sh v1.2.0   # or a specific release
```

This backs up the database, fetches the code, rebuilds, restarts, applies any database changes, and waits until the
CRM answers. It takes a few minutes. People should save their work first, as the CRM is unavailable for 1 to 2
minutes.

**If something is wrong after an upgrade:**
1. Go back to the previous code: `deploy/upgrade.sh v1.1.0`, using the version that worked.
2. If the new version changed the database, also put the data back:
   `scripts/restore.sh pre-upgrade-v1.2.0-….dump`. Anything entered since the upgrade is lost, so tell people.

## 6. People joining and leaving

- **Joining:** Settings → Users & roles → Add user.
  - With email set up, leave the password blank to send an invitation.
  - Otherwise use the wand button to generate a temporary password and tell them. They choose their own at
    first sign-in.
- **Leaving:** edit the user and untick Active. They are signed out at once. Their deals stay; reassign them from
  the pipeline.
- **Locked out after wrong passwords:** an Unlock button appears next to them. The lock also lifts by itself after
  15 minutes.
- **Forgot password:** "Forgot password?" on the sign-in page if email is set up. Otherwise edit the user and set a
  temporary password.

## 7. When something is wrong

| What you see | What to do |
|---|---|
| Page says "Something went wrong … reference ABC123" | `docker compose logs app \| grep ABC123` shows the full error. |
| CRM doesn't open | `docker compose ps` (all should be "running"/"healthy"), then `docker compose logs --tail 100 app`. |
| App stops at start with "cannot start" | The log says which setting in `.env` is wrong. |
| Every administrator locked out or gone | `scripts/create-admin.sh you@yourcompany.com "Your Name"` |
| "The database upgrade failed" | Nothing was changed for users. Send the log to whoever made the change. To roll back, see section 5. |
| Disk full | `docker system prune` removes old images. Check the `backups` volume size. |

Logs are kept at 10 MB × 5 files per service, so they never fill the disk.

## 8. Changing the CRM with Claude (or any developer) safely

You don't have a team of engineers checking each change, so the repository checks them instead:

1. **Every change goes on a branch and through CI.** CI runs lint, types, unit tests, the full browser test, the
   Docker build and two data checks:
   - **Migration check:** the database changes already used in production (`prisma/migrations/shipped.txt`) must
     never be edited, and new ones may only add things. Dropping or renaming a column or table fails unless it is
     explicitly marked as intended.
   - **Drift check:** every change to the data model must come with a migration, so the production database is
     always upgraded to match the code.

   Don't deploy a commit whose CI is red.
2. **Claude follows `CLAUDE.md`** at the top of the repository. It reads that file automatically and it sets the rules:
   additive database changes, existing records filled in, tests before committing, a changelog entry.
3. **Try it on the test server first.** Upgrade the test install, which can run with demo data or a restored copy of
   last night's production backup, and click through what changed.
4. **Then upgrade production** with `deploy/upgrade.sh <version>`. The automatic pre-upgrade backup is your undo
   button.
5. **After a successful production upgrade**, record its database changes as shipped and commit:
   `node scripts/check-migrations.mjs --ship`. Ask Claude to do this as part of tagging the release.

When you ask Claude for a change, these phrases help:
- "Keep existing data. Tell me what happens to current records."
- "Is this change additive? Does it need a data migration?"
- "Bump the version and add a CHANGELOG entry."

Dependencies (Next.js, Prisma and so on) are pinned to exact versions, so nothing changes unless someone updates
them on purpose. Update them occasionally as a separate change, on its own branch, and let CI and the test server
prove it before production.
