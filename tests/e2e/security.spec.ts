// Production basics: account lockout and unlock, temporary passwords, signing out other devices, and two people
// editing the same deal. Runs against the seeded demo data and is safe to re-run.
import { test, expect, type Page, type Browser } from "@playwright/test";

const PASSWORD = "Progression@123";
const ADMIN = "admin@progression.com";
const HEAD = "vivek.malhotra@progression.com";
const LOCKED = { email: "naresh.kumar@progression.com", name: "Naresh Kumar" };
const TEMP = { email: "bhushan.khadage@progression.com", name: "Bhushan Khadage" };

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
}

async function asAdmin(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, ADMIN);
  await page.waitForURL(/\/dashboard/);
  return { ctx, page };
}

async function setTempPassword(page: Page, name: string, password: string) {
  await page.goto("/admin?tab=users");
  await page.getByRole("row", { name: new RegExp(name) }).getByRole("button", { name: "Edit user" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Reset password").fill(password);
  await dlg.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`${name} was signed out of all devices.`)).toBeVisible();
}

test.describe("Sign-in security", () => {
  test("ten wrong passwords lock the account; an administrator unlocks it", async ({ page, browser }) => {
    for (let i = 0; i < 10; i++) {
      await signIn(page, LOCKED.email, `Wrong-Password-${i}`);
      await expect(page.locator("p[role=alert]")).toBeVisible();
    }
    await expect(page.locator("p[role=alert]")).toContainText("locked after too many wrong passwords");
    // Even the right password is refused while locked
    await signIn(page, LOCKED.email);
    await expect(page.locator("p[role=alert]")).toContainText("locked");

    const admin = await asAdmin(browser);
    await admin.page.goto("/admin?tab=users");
    const row = admin.page.getByRole("row", { name: new RegExp(LOCKED.name) });
    await expect(row.getByText("Locked")).toBeVisible();
    await row.getByRole("button", { name: "Unlock" }).click();
    await expect(admin.page.getByText(`${LOCKED.name} unlocked`)).toBeVisible();
    await admin.page.goto("/admin?tab=audit&entity=User");
    await expect(admin.page.getByText("LOGIN_FAILED").first()).toBeVisible();
    await expect(admin.page.getByText("UNLOCKED").first()).toBeVisible();
    await admin.ctx.close();

    await signIn(page, LOCKED.email);
    await page.waitForURL(/\/dashboard/);
  });

  test("a password set by an administrator must be replaced, and resetting it signs out other devices", async ({ page, browser }) => {
    const admin = await asAdmin(browser);
    await setTempPassword(admin.page, TEMP.name, "Temp-Pass-2049");

    // First sign-in with the temporary password goes straight to choosing a new one
    await signIn(page, TEMP.email, "Temp-Pass-2049");
    await page.waitForURL(/\/account\/password/);
    await expect(page.getByRole("heading", { name: "Choose your own password" })).toBeVisible();
    await page.goto("/pipeline");
    await page.waitForURL(/\/account\/password/);
    await page.getByLabel("Password you were given").fill("Temp-Pass-2049");
    await page.getByLabel("New password", { exact: true }).fill("weakpassword1");
    await page.getByLabel("Confirm new password").fill("weakpassword1");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("Include an uppercase letter");
    await page.getByLabel("New password", { exact: true }).fill("Kestrel-Harbour-77");
    await page.getByLabel("Confirm new password").fill("Kestrel-Harbour-77");
    await page.getByRole("button", { name: "Save password" }).click();
    await page.waitForURL(/\/dashboard/);

    // Another reset by the administrator signs this browser out
    await setTempPassword(admin.page, TEMP.name, "Temp-Pass-2050");
    await page.goto("/pipeline");
    await page.waitForURL(/\/login/);
    await admin.ctx.close();
  });

  test("without email set up, forgot password points people to an administrator", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Can't sign in?" }).click();
    await expect(page.getByText("Ask your CRM administrator to reset your password")).toBeVisible();
  });

  test("the email settings never send the saved password back to the browser", async ({ browser }) => {
    const admin = await asAdmin(browser);
    await admin.page.goto("/admin?tab=system");
    await admin.page.getByLabel("SMTP server").fill("smtp.example.com");
    await admin.page.getByLabel("SMTP password").fill("Sup3r-Secret-Smtp");
    await admin.page.getByLabel("From address").fill("crm@example.com");
    await admin.page.getByRole("button", { name: "Save" }).click();
    await expect(admin.page.getByText("Email settings saved")).toBeVisible();
    await admin.page.reload();
    await expect(admin.page.getByText("Saved. Leave blank to keep it.")).toBeVisible();
    expect(await admin.page.content()).not.toContain("Sup3r-Secret-Smtp");
    await expect(admin.page.getByText(/Connected ·/)).toBeVisible();
    await admin.ctx.close();
  });
});

test.describe("Two people at once", () => {
  test("the second save of the same deal is refused instead of overwriting the first", async ({ browser }) => {
    const a = await browser.newContext();
    const b = await browser.newContext();
    const pa = await a.newPage();
    const pb = await b.newPage();
    for (const p of [pa, pb]) {
      await signIn(p, HEAD);
      await p.waitForURL(/\/dashboard/);
    }
    await pa.goto("/opportunities?stage=QUALIFIED");
    const href = await pa.locator("table a[href^='/opportunities/']").first().getAttribute("href");
    await pa.goto(`${href}/edit`);
    await pb.goto(`${href}/edit`);

    await pa.locator("#nextStep").fill("Call the CIO (first editor)");
    await pa.getByRole("button", { name: "Save changes" }).click();
    await pa.waitForURL(new RegExp(`${href}$`));

    await pb.locator("#nextStep").fill("Send the deck (second editor)");
    await pb.getByRole("button", { name: "Save changes" }).click();
    await expect(pb.getByText(/changed this deal at .* after you opened it/)).toBeVisible();

    await pa.reload();
    await expect(pa.getByText("Call the CIO (first editor)").first()).toBeVisible();
    await a.close();
    await b.close();
  });
});
