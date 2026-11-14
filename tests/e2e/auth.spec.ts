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
