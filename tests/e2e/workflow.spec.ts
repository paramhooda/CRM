// End-to-end: Sales creates a deal → pulls in Presales → Presales builds BOQ and submits to Purchase →
// Purchase prices it → Sales prices at margin, quotes and closes as won. Also checks role permissions.
import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "Progression@123";
const SALES = "rakesh.pawar@progression.com";
const PRESALES = { email: "rakesh.yadav@progression.com", name: "Rakesh Yadav" };
const PURCHASE = { email: "meera.iyer@progression.com", name: "Meera Iyer" };
const dealName = `E2E Bank - Branch SD-WAN ${Date.now().toString().slice(-6)}`;

async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/dashboard/);
}

test.describe.serial("Sales → Presales → Purchase workflow", () => {
  let oppUrl = "";

  test("sales creates an opportunity and pulls in presales", async ({ page }) => {
    await login(page, SALES);
    await page.goto("/opportunities/new");
    await page.fill("#name", dealName);
    await page.selectOption("#accountId", { label: "Zenith Capital Finance Ltd" });
    await page.selectOption("#businessUnitId", { label: "IT Infrastructure" });
    await page.selectOption("#categoryId", { label: "Networking" });
    await page.selectOption("#oemId", { label: "Cisco" });
    await page.fill("#amount", "4500000");
    await page.fill("#nextStep", "Requirement workshop");
    await page.click("button:has-text('Create opportunity')");
    await page.waitForURL((u) => /\/opportunities\/c[a-z0-9]{20,}$/.test(u.pathname));
    oppUrl = new URL(page.url()).pathname;
    await expect(page.getByRole("heading", { name: dealName })).toBeVisible();

    await page.getByRole("button", { name: "Pull in presales" }).first().click();
    const dlg = page.getByRole("dialog");
    await dlg.locator("select[name=assignedToId]").selectOption({ label: PRESALES.name });
    await dlg.locator("textarea[name=scope]").fill("SD-WAN for 40 branches with dual ISP links and central orchestration.");
    await dlg.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText("Presales notified")).toBeVisible();
    await expect(page.getByRole("button", { name: "BOQ", exact: true })).toBeDisabled(); // now the current stage
  });

  test("presales sees the request, builds the BOQ and submits to purchase", async ({ page }) => {
    await login(page, PRESALES.email);
    await page.goto("/requests");
    await expect(page.getByRole("link", { name: dealName })).toBeVisible();
    await page.goto(`${oppUrl}?tab=boq`);
    // Field-level security: presales never sees buy prices
    await expect(page.getByRole("columnheader", { name: "Unit cost" })).toHaveCount(0);
    await page.getByRole("button", { name: "Add line" }).click();
    await page.getByLabel("Line 1 description").fill("SD-WAN edge appliance with 3-year licence");
    await page.getByLabel("Line 1 quantity").fill("40");
    await page.getByRole("button", { name: "Add line" }).click();
    await page.getByLabel("Line 2 description").fill("Deployment and orchestration setup");
    await page.getByLabel("Line 2 quantity").fill("1");
    await page.getByRole("button", { name: "Save BOQ" }).click();
    await expect(page.getByText("BOQ saved")).toBeVisible();

    await page.getByRole("button", { name: "Submit BOQ to purchase" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.locator("textarea[name=solutionSummary]").fill("Cisco based SD-WAN sized for 40 branches with HA at DC.");
    await dlg.locator("select[name=purchaseUserId]").selectOption({ label: PURCHASE.name });
    await dlg.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("BOQ submitted. Purchase notified.")).toBeVisible();
  });

  test("purchase prices the BOQ", async ({ page }) => {
    await login(page, PURCHASE.email);
    await page.goto("/requests");
    await expect(page.getByRole("link", { name: dealName })).toBeVisible();
    await page.goto(`${oppUrl}?tab=boq`);
    await page.getByLabel("Line 1 unit cost").fill("92000");
    await page.getByLabel("Line 2 unit cost").fill("300000");
    await page.getByRole("button", { name: "Save BOQ" }).click();
    await expect(page.getByText("BOQ saved")).toBeVisible();
    await page.getByRole("button", { name: "Pricing complete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Send to sales" }).click();
    await expect(page.getByText("Pricing sent to sales")).toBeVisible();
  });

  test("sales prices at margin, quotes and closes as won", async ({ page }) => {
    await login(page, SALES);
    await page.goto(`${oppUrl}?tab=boq`);
    await page.getByLabel("Target margin %").fill("18");
    await page.getByRole("button", { name: "Price at margin" }).click();
    await page.getByRole("button", { name: "Save BOQ" }).click();
    await expect(page.getByText("BOQ saved")).toBeVisible();
    await expect(page.getByText("18.0%").first()).toBeVisible();

    await page.getByRole("button", { name: "Generate quote" }).click();
    const popup = page.waitForEvent("popup");
    await page.getByRole("dialog").getByRole("button", { name: "Generate" }).click();
    const quote = await popup;
    await expect(quote.getByText("Quotation", { exact: true })).toBeVisible();
    await quote.close();

    await page.goto(oppUrl);
    await expect(page.getByRole("button", { name: "Proposal Submitted" })).toBeDisabled();
    await page.getByRole("button", { name: "Won" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.locator("input[name=poNumber]").fill("PO/E2E/0001");
    await dlg.getByRole("button", { name: "Mark as won" }).click();
    await expect(page.getByText("Moved to Closed-Won")).toBeVisible();
  });
});

test.describe("Role permissions", () => {
  test("sales cannot open admin settings", async ({ page }) => {
    await login(page, SALES);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("closing as won requires a PO", async ({ page }) => {
    await login(page, "vivek.malhotra@progression.com");
    await page.goto("/opportunities?stage=PROPOSAL");
    const href = await page.locator("table a[href^='/opportunities/']").first().getAttribute("href");
    await page.goto(href!);
    await page.getByRole("button", { name: "Won" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.locator("input[name=poNumber]").fill("");
    await dlg.getByRole("button", { name: "Mark as won" }).click();
    await expect(page.getByText(/PO number/).first()).toBeVisible();
  });

  test("unauthenticated API access is rejected", async ({ request }) => {
    const r = await request.get("/api/export/opportunities", { maxRedirects: 0 });
    expect(r.status()).toBe(401);
  });
});
