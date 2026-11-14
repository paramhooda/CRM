import { test, expect } from "@playwright/test";
import { go, login, USERS, type UserKey } from "./helpers";

// Login and logout for every role; each lands where its work is.
for (const key of ["admin", "salesHead", "rep", "presales", "purchase"] as UserKey[]) {
  test(`${key} signs in, lands on ${USERS[key].home}, signs out`, async ({ page }) => {
    await login(page, key);
    await expect(page).toHaveURL(new RegExp(`${USERS[key].home}$`));
    // The signed-in person is named in the account menu
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByRole("menu").getByText(USERS[key].name)).toBeVisible();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    // The session is gone: a protected page bounces back to login
    await go(page, USERS[key].home);
    await expect(page).toHaveURL(/\/login/);
  });
}

test("a demo login signs in as that role in one click", async ({ page }) => {
  await go(page, "/login");
  await page.getByRole("button", { name: /Presales · Rakesh Yadav/ }).click();
  await expect(page).toHaveURL(/\/my-work$/);
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByRole("menu").getByText("Rakesh Yadav")).toBeVisible();
});

test("wrong password is refused with a clear message, and the form stays usable", async ({ page }) => {
  await go(page, "/login");
  await page.fill("#email", USERS.rep.email);
  await page.fill("#password", "not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /email or password/i })).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("support roles cannot open the sales home or funnel", async ({ page }) => {
  await login(page, "presales");
  await go(page, "/home");
  await expect(page).toHaveURL(/\/my-work$/);
  const r = await page.request.get("/api/v1/metrics/home");
  expect(r.status()).toBe(403);
});

test("the sidebar is one line per module, minimises from its own button, and remembers it", async ({ page }) => {
  await login(page, "salesHead");
  const nav = page.locator("[data-sidebar='sidebar']");
  for (const label of ["Home", "Deals", "Accounts", "Contacts", "Leads", "Approvals", "Pipeline review", "Targets"]) await expect(nav.getByRole("link", { name: new RegExp(`^${label}`) })).toBeVisible();
  // Creating things lives on each module's page, not in the navigation
  await expect(nav.getByRole("link", { name: /New deal|All open|Board|Closed-won/ })).toHaveCount(0);
  await expect(nav.getByText("Admin", { exact: true })).toHaveCount(0);
  await expect(nav.getByPlaceholder("Filter navigator")).toHaveCount(0);
  await nav.getByRole("button", { name: "Minimise" }).click();
  await expect(page.locator("[data-slot='sidebar']").first()).toHaveAttribute("data-state", "collapsed");
  const railWidth = async () => (await page.locator("[data-slot='sidebar-container']").boundingBox())!.width;
  await expect.poll(railWidth).toBeLessThan(80); // the icon rail
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("[data-slot='sidebar']").first()).toHaveAttribute("data-state", "collapsed");
  await nav.getByRole("button", { name: "Expand" }).click();
  await expect(page.locator("[data-slot='sidebar']").first()).toHaveAttribute("data-state", "expanded");
  await expect.poll(railWidth).toBeGreaterThan(250);
  // The admin gets an Admin section; a rep does not
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await login(page, "admin");
  await expect(nav.getByText("Admin", { exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Audit log" })).toBeVisible();
});
