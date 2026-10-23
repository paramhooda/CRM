// End-to-end: Sales creates a multi-OEM deal from the product catalogue → pulls in Presales → Presales extends
// the BOQ and submits to Purchase → Purchase prices it → Sales prices, quotes and closes as won (lines lock for
// billing). Also checks role homes, permissions and the product master.
import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "Progression@123";
const SALES = "rakesh.pawar@progression.com";
const HEAD = "vivek.malhotra@progression.com";
const ADMIN = "admin@progression.com";
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

async function pickProduct(page: Page, pickerIndex: number, sku: string) {
  await page.getByRole("button", { name: "Product", exact: true }).nth(pickerIndex).click();
  await page.getByPlaceholder("Search SKU, product, OEM or category").fill(sku);
  await page.getByRole("button", { name: new RegExp(sku) }).click();
}

test.describe.serial("Sales → Presales → Purchase workflow with multi-OEM line items", () => {
  let oppUrl = "";

  test("sales creates a multi-OEM deal from the catalogue and pulls in presales", async ({ page }) => {
    await login(page, SALES);
    await page.goto("/opportunities/new");
    await page.fill("#name", dealName);
    await page.selectOption("#accountId", { label: "Zenith Capital Finance Ltd" });
    await page.getByRole("button", { name: "Add product" }).click();
    await pickProduct(page, 0, "CSCO-NET-02");
    await page.getByLabel("New line 1 quantity").fill("10");
    await page.getByRole("button", { name: "Add product" }).click();
    await pickProduct(page, 1, "FTNT-SLC-02");
    await page.getByLabel("New line 2 quantity").fill("2");
    // Value rolls up from the lines: 10 × 2,52,350 + 2 × 9,10,800
    await expect(page.getByText("₹43.5 L").first()).toBeVisible();
    await page.fill("#nextStep", "Requirement workshop");
    await page.click("button:has-text('Create opportunity')");
    await page.waitForURL((u) => /\/opportunities\/c[a-z0-9]{20,}$/.test(u.pathname));
    oppUrl = new URL(page.url()).pathname;
    await expect(page.getByRole("heading", { name: dealName })).toBeVisible();
    await expect(page.getByText("₹43.5 L").first()).toBeVisible();

    await page.goto(`${oppUrl}?tab=boq`);
    await expect(page.getByText("Cisco", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("By OEM")).toBeVisible();

    await page.getByRole("button", { name: "Pull in presales" }).first().click();
    const dlg = page.getByRole("dialog");
    await dlg.locator("select[name=assignedToId]").selectOption({ label: PRESALES.name });
    await dlg.locator("textarea[name=scope]").fill("SD-WAN for 40 branches with dual ISP links and central orchestration.");
    await dlg.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText("Presales notified")).toBeVisible();
  });

  test("presales sees it on the My work home, adds a line and submits to purchase", async ({ page }) => {
    await login(page, PRESALES.email);
    await expect(page.getByRole("heading", { name: "My BOQ queue" })).toBeVisible();
    const row = page.getByTestId("work-queue").locator("li", { hasText: dealName });
    await expect(row).toBeVisible();
    await row.getByRole("link", { name: /Open BOQ/ }).click();
    await page.waitForURL(/tab=boq/);
    // Presales can see cost (nothing hidden) but cannot change it
    await expect(page.getByRole("columnheader", { name: "Unit cost" })).toBeVisible();
    await expect(page.getByLabel("Line 1 unit cost")).toHaveCount(0);
    await page.getByRole("button", { name: "Add line" }).click();
    await pickProduct(page, 2, "PRG-PSV-02");
    await page.getByLabel("Line 3 quantity").fill("20");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Line items saved")).toBeVisible();

    await page.getByRole("button", { name: "Submit BOQ to purchase" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.locator("textarea[name=solutionSummary]").fill("Cisco SD-WAN edge with Fortinet NGFW at hub, sized for 40 branches.");
    await dlg.locator("select[name=purchaseUserId]").selectOption({ label: PURCHASE.name });
    await dlg.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("BOQ submitted. Purchase notified.")).toBeVisible();
  });

  test("purchase sees the RFQ by OEM and prices the BOQ", async ({ page }) => {
    await login(page, PURCHASE.email);
    await expect(page.getByRole("heading", { name: "My pricing queue" })).toBeVisible();
    await expect(page.getByText("Quotes to request, by OEM")).toBeVisible();
    await page.getByTestId("work-queue").locator("li", { hasText: dealName }).getByRole("link", { name: /Price it/ }).click();
    await page.waitForURL(/tab=boq/);
    await page.getByRole("button", { name: "Standard costs" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Line items saved")).toBeVisible();
    await page.getByRole("button", { name: "Pricing complete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Send to sales" }).click();
    await expect(page.getByText("Pricing sent to sales")).toBeVisible();
  });

  test("sales prices at margin, quotes and closes as won; lines lock for billing", async ({ page }) => {
    await login(page, SALES);
    await page.goto(`${oppUrl}?tab=boq`);
    await page.getByLabel("Target margin %").fill("18");
    await page.getByRole("button", { name: "Price at margin" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Line items saved")).toBeVisible();
    await expect(page.getByText("18.0%").first()).toBeVisible();

    await page.getByRole("button", { name: "Generate quote" }).click();
    const popup = page.waitForEvent("popup");
    await page.getByRole("dialog").getByRole("button", { name: "Generate" }).click();
    const quote = await popup;
    await expect(quote.getByText("Quotation", { exact: true })).toBeVisible();
    await expect(quote.getByText("85176290").first()).toBeVisible(); // HSN carried onto the quote
    await quote.close();

    await page.goto(oppUrl);
    await expect(page.getByRole("button", { name: "Proposal Submitted" })).toBeDisabled();
    await page.getByRole("button", { name: "Won" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.locator("input[name=poNumber]").fill("PO/E2E/0001");
    await dlg.getByRole("button", { name: "Mark as won" }).click();
    await expect(page.getByText("Moved to Closed-Won")).toBeVisible();
    await page.goto(`${oppUrl}?tab=boq`);
    await expect(page.getByText(/Locked for billing/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Add line" })).toHaveCount(0);
  });

  test("line-item export carries billing columns", async ({ page }) => {
    await login(page, HEAD);
    const res = await page.request.get(`/api/export/opportunities?stage=WON&mode=lines&q=${encodeURIComponent(dealName)}`);
    expect(res.status()).toBe(200);
    const csv = await res.text();
    expect(csv).toContain("HSN/SAC");
    expect(csv).toContain("Ready to bill");
    expect(csv.split("\r\n").length).toBe(4); // header + 3 lines
  });
});

test.describe("Roles and permissions", () => {
  test("sales cannot open admin settings or edit products", async ({ page }) => {
    await login(page, SALES);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/products");
    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New product" })).toHaveCount(0);
  });

  test("admin adds a product to the catalogue", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/products");
    await page.getByRole("button", { name: "New product" }).click();
    const dlg = page.getByRole("dialog");
    const sku = `E2E-${Date.now().toString().slice(-6)}`;
    await dlg.locator("input[name=code]").fill(sku);
    await dlg.locator("input[name=name]").fill("Cisco Catalyst 9300 48-port");
    await dlg.locator("select[name=businessUnitId]").selectOption({ label: "IT Infrastructure" });
    await dlg.locator("select[name=categoryId]").selectOption({ label: "Networking" });
    await dlg.locator("select[name=oemId]").selectOption({ label: "Cisco" });
    await dlg.locator("input[name=listPrice]").fill("410000");
    await dlg.locator("input[name=standardCost]").fill("352000");
    await dlg.locator("input[name=hsnSac]").fill("85176290");
    await dlg.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Product added")).toBeVisible();
    await page.goto(`/products?q=${sku}`);
    await expect(page.getByText(sku)).toBeVisible();
  });

  test("closing as won requires a PO", async ({ page }) => {
    await login(page, HEAD);
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
