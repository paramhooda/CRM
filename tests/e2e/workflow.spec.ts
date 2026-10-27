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

/** The stage the deal is in, from the stage path */
const currentStage = (page: Page) => page.getByRole("list", { name: "Stage" }).locator("[aria-current=step]");
/** An item from the status line's More / Actions menu */
async function statusMenu(page: Page, item: string) {
  await page.getByLabel("Deal status").getByRole("button", { name: /^(More|Actions)$/ }).click();
  await page.getByRole("menuitem", { name: item }).click();
}
/** An item from the stage bar's More menu */
async function stageMenu(page: Page, item: string) {
  await page.getByRole("list", { name: "Stage" }).locator("xpath=..").getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

/** A date input value `days` from today, and how the app prints it */
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const shortDate = (days: number) => new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });

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
    // Exact catalogue products instead of the rough split
    await page.getByRole("button", { name: "Pick an exact product" }).click();
    await page.getByRole("button", { name: "Remove line 1" }).click();
    await pickProduct(page, 0, "CSCO-NET-02");
    await page.getByLabel("Line 1 quantity").fill("10");
    await page.getByRole("button", { name: "Pick an exact product" }).click();
    await pickProduct(page, 1, "FTNT-SLC-02");
    await page.getByLabel("Line 2 quantity").fill("2");
    // Networking needs a solution design, so presales is suggested
    await expect(page.getByRole("radio", { name: /Needs presales/ })).toHaveAttribute("aria-checked", "true");
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

    // One click per stage: qualify, then advancing to BOQ is the BOQ request itself
    await expect(currentStage(page)).toHaveText("Identified");
    await expect(page.getByRole("list", { name: "Stage" }).getByRole("button")).toHaveCount(0); // stages are not clickable
    await page.getByRole("button", { name: "Advance to Qualified" }).click();
    await expect(page.getByText("Moved to Qualified")).toBeVisible();
    await page.getByRole("button", { name: "Advance to BOQ" }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg.getByText("Request BOQ from presales")).toBeVisible();
    await dlg.locator("select[name=assignedToId]").selectOption({ label: PRESALES.name });
    await dlg.locator("textarea[name=scope]").fill("SD-WAN for 40 branches with dual ISP links and central orchestration.");
    await dlg.getByRole("button", { name: "Send to presales" }).click();
    await expect(page.getByText("Presales notified")).toBeVisible();
    // The deal moves to the BOQ stage and says who holds it
    await expect(currentStage(page)).toHaveText("BOQ");
    await expect(page.getByLabel("Deal status")).toContainText("BOQ with presales");
    // The next step belongs to presales, so sales sees it disabled with the reason
    await expect(page.getByRole("button", { name: /Advance to Pricing/ })).toBeDisabled();
    await expect(page.getByLabel("Deal status")).toContainText(PRESALES.name);
  });

  test("filtering by OEM shows that OEM's share of the mixed deal", async ({ page }) => {
    await login(page, SALES);
    await page.goto(`/opportunities?q=${encodeURIComponent(dealName)}`);
    await page.getByRole("button", { name: /^OEM/ }).click();
    await page.getByPlaceholder("Search oem…").fill("Fortinet");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/oem=/);
    await expect(page.getByRole("columnheader", { name: "Fortinet value" })).toBeVisible();
    const row = page.locator("tr", { hasText: dealName });
    await expect(row).toContainText("₹43.5 L"); // whole deal
    await expect(row).toContainText("₹18.2 L"); // Fortinet lines only: 2 × 9,10,800
    await expect(page.getByText(/Fortinet's share of each deal/)).toBeVisible();
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
    // Progression is our own brand: its cost comes from the rate card, not from purchase
    await expect(page.getByLabel("Line 3 cost source")).toHaveValue("RATE_CARD");
    await expect(page.getByLabel("Line 1 cost source")).toHaveCount(0); // Cisco: purchase only
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Line items saved")).toBeVisible();
    await expect(page.getByLabel("Line items").getByText("Rate card", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Advance to Pricing" }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg.getByText("Submit BOQ")).toBeVisible();
    await expect(dlg.getByText("2 of 3 lines go to purchase")).toBeVisible();
    await dlg.locator("textarea[name=solutionSummary]").fill("Cisco SD-WAN edge with Fortinet NGFW at hub, sized for 40 branches.");
    await dlg.locator("select[name=purchaseUserId]").selectOption({ label: PURCHASE.name });
    await dlg.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("BOQ submitted. Purchase notified.")).toBeVisible();
    await expect(currentStage(page)).toHaveText("Pricing");
    await expect(page.getByLabel("Deal status")).toContainText("Pricing with purchase");
  });

  test("purchase sees the RFQ by OEM and prices the BOQ", async ({ page }) => {
    await login(page, PURCHASE.email);
    await expect(page.getByRole("heading", { name: "My pricing queue" })).toBeVisible();
    await expect(page.getByText("Quotes to request, by OEM")).toBeVisible();
    // Local queue search narrows the list without touching the page URL
    await page.getByLabel("Search queue").fill(dealName);
    await expect(page.getByTestId("work-queue").locator("li")).toHaveCount(1);
    await page.getByTestId("work-queue").locator("li", { hasText: dealName }).getByRole("link", { name: /Price it/ }).click();
    await page.waitForURL(/tab=boq/);
    await page.getByRole("button", { name: "Standard costs" }).click();
    // The rate-carded Progression line is not purchase's to cost
    await expect(page.getByLabel("Line 3 unit cost")).toHaveCount(0);
    // Each supplier quotes its own validity
    await page.getByLabel("Line 2 supplier validity").fill(inDays(12));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Line items saved")).toBeVisible();
    await page.getByRole("button", { name: "Pricing complete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Send to sales" }).click();
    await expect(page.getByText("Pricing sent to sales")).toBeVisible();
    // Line 1 took the dialog's date (30 days), line 2 kept the supplier's own
    await expect(page.getByText(/^Purchase · valid till/)).toHaveCount(2);
    await expect(page.getByText(new RegExp(`valid till ${shortDate(12)}`))).toBeVisible();
  });

  test("sales asks for a BOQ revision; presales asks a question and sales answers", async ({ page }) => {
    await login(page, SALES);
    await page.goto(`${oppUrl}?tab=boq`);
    await expect(page.getByLabel("Deal status")).toContainText("Priced · ready to quote");
    await statusMenu(page, "Request BOQ change");
    let dlg = page.getByRole("dialog");
    await expect(dlg.getByText("Request BOQ change (revision 2)")).toBeVisible();
    await dlg.locator("textarea[name=reason]").fill("Customer wants 12 Cisco edge devices instead of 10.");
    await dlg.getByRole("button", { name: "Send to presales" }).click();
    await expect(page.getByText("Presales notified")).toBeVisible();
    await expect(page.getByLabel("Deal status")).toContainText("BOQ revision 2 with presales");
    await expect(currentStage(page)).toHaveText("BOQ"); // back from Pricing to BOQ
    // Only the presales assignee edits the specification now
    await expect(page.getByText("Products and quantities locked")).toBeVisible();

    await login(page, PRESALES.email);
    await page.goto(`${oppUrl}?tab=boq`);
    // The BOQ reads cleanly; editable fields appear in edit mode
    await expect(page.getByLabel("Line 1 quantity")).toHaveCount(0);
    await page.getByRole("button", { name: "Edit line items" }).click();
    await page.getByLabel("Line 1 quantity").fill("12");
    // Presales reworks the rate card for this deal: the line becomes a presales cost
    await page.getByLabel("Line 3 unit cost").fill("4500");
    await expect(page.getByLabel("Line 3 cost source")).toHaveValue("PRESALES");
    await page.getByLabel("Line 3 costing note").fill("Two extra days of on-site cutover");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Line items saved")).toBeVisible();
    await expect(page.getByLabel("Line 1 quantity")).toHaveCount(0); // back to the read view
    await expect(page.getByText("Needs re-pricing")).toBeVisible();
    await expect(page.getByLabel("Line items").getByText("Presales", { exact: true })).toBeVisible();
    await statusMenu(page, "Ask sales a question");
    dlg = page.getByRole("dialog");
    await dlg.locator("textarea[name=question]").fill("Do the two extra devices need their own licence?");
    await dlg.getByRole("button", { name: "Send question" }).click();
    await expect(page.getByText("Question sent to sales")).toBeVisible();

    await login(page, SALES);
    await page.goto(`${oppUrl}?tab=boq`);
    await expect(page.getByLabel("Deal status")).toContainText("Presales is waiting for an answer");
    await page.getByRole("button", { name: "Answer presales" }).click();
    dlg = page.getByRole("dialog");
    await dlg.locator("textarea[name=answer]").fill("Yes, add licences for all 12.");
    await dlg.getByRole("button", { name: "Send answer" }).click();
    await expect(page.getByText("Answer sent. Presales has resumed.")).toBeVisible();

    await login(page, PRESALES.email);
    await page.goto(`${oppUrl}?tab=boq`);
    await page.getByRole("button", { name: "Advance to Pricing" }).click();
    dlg = page.getByRole("dialog");
    await expect(dlg.getByText("1 of 3 lines go to purchase")).toBeVisible(); // unchanged and own-brand lines keep their cost
    await dlg.locator("textarea[name=solutionSummary]").fill("Revision 2: 12 edge devices with licences.");
    await dlg.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("BOQ submitted. Purchase notified.")).toBeVisible();
  });

  test("purchase sends the BOQ back; presales resubmits; purchase re-prices only the changed line", async ({ page }) => {
    await login(page, SALES);
    await page.goto(`${oppUrl}?tab=boq`);
    await expect(page.getByLabel("Deal status")).toContainText("with purchase");
    await expect(page.getByRole("button", { name: "Add line" })).toHaveCount(0); // locked while purchase prices it

    await login(page, PURCHASE.email);
    await page.goto(`${oppUrl}?tab=boq`);
    await statusMenu(page, "Send back to presales");
    let dlg = page.getByRole("dialog");
    await dlg.locator("textarea[name=reason]").fill("Confirm the licence SKU for the two extra devices.");
    await dlg.getByRole("button", { name: "Send back" }).click();
    await expect(page.getByText("Sent back", { exact: true })).toBeVisible();

    await login(page, PRESALES.email);
    await page.goto(`${oppUrl}?tab=boq`);
    await expect(page.getByLabel("Deal status")).toContainText("BOQ revision 3 with presales");
    await page.getByRole("button", { name: "Advance to Pricing" }).click();
    dlg = page.getByRole("dialog");
    await dlg.locator("textarea[name=solutionSummary]").fill("Licence SKU confirmed with the OEM.");
    await dlg.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("BOQ submitted. Purchase notified.")).toBeVisible();

    await login(page, PURCHASE.email);
    await page.goto(`${oppUrl}?tab=boq`);
    await expect(page.getByLabel("Deal status")).toContainText("Re-pricing with purchase");
    await page.getByRole("button", { name: "Enter costs" }).click(); // purchase edits only costs
    await expect(page.getByLabel("Line 1 quantity")).toHaveCount(0);
    await page.getByLabel("Line 1 unit cost").fill("240000");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Line items saved")).toBeVisible();
    await expect(page.getByText("Needs re-pricing")).toHaveCount(0);
    await page.getByRole("button", { name: "Pricing complete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Send to sales" }).click();
    await expect(page.getByText("Pricing sent to sales")).toBeVisible();
  });

  test("sales prices at margin, quotes and closes as won; lines lock for billing", async ({ page }) => {
    await login(page, SALES);
    await page.goto(`${oppUrl}?tab=boq`);
    // A second tab opened on the same BOQ cannot overwrite a newer save
    const other = await page.context().newPage();
    await other.goto(`${oppUrl}?tab=boq&edit=1`);
    await page.getByRole("button", { name: "Edit line items" }).click();
    await page.getByLabel("Target margin %").fill("18");
    await page.getByRole("button", { name: "Price at margin" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Line items saved")).toBeVisible();
    await expect(page.getByText("18.0%").first()).toBeVisible();
    await other.getByLabel("Line 1 unit price").fill("1");
    await other.getByRole("button", { name: "Save", exact: true }).click();
    await expect(other.getByText(/Someone else saved this BOQ/)).toBeVisible();
    await other.close();

    // Advancing to Proposal is sending the quote
    await page.getByRole("button", { name: "Advance to Proposal" }).click();
    let popup = page.waitForEvent("popup");
    await page.getByRole("dialog").getByRole("button", { name: "Create & send quote" }).click();
    const quote = await popup;
    await expect(quote.getByText("Quotation", { exact: true })).toBeVisible();
    await expect(quote.getByText("85176290").first()).toBeVisible(); // HSN carried onto the quote
    await quote.close();

    // Customer asks for changes: sales re-issues a new version
    await page.goto(`${oppUrl}?tab=boq`);
    await expect(currentStage(page)).toHaveText("Proposal Submitted");
    await page.getByRole("button", { name: "Record customer response" }).click();
    let dlg = page.getByRole("dialog");
    await dlg.getByRole("radio", { name: "Wants changes" }).click();
    await dlg.locator("textarea[name=note]").fill("Asked for a lower price on the edge devices.");
    await dlg.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Response recorded")).toBeVisible();
    await expect(page.getByLabel("Deal status")).toContainText("Customer wants changes");
    // Revised quote at a new margin, set in the same dialog
    await page.getByLabel("Deal status").getByRole("button", { name: "Send revised quote" }).click();
    dlg = page.getByRole("dialog");
    await dlg.getByRole("radio", { name: "Apply a margin" }).click();
    await dlg.getByLabel("Gross margin %").fill("16");
    await expect(dlg.getByText("16.0%")).toBeVisible();
    popup = page.waitForEvent("popup");
    await dlg.getByRole("button", { name: "Send revised quote" }).click();
    await (await popup).close();
    await expect(page.getByLabel("Deal status")).toContainText("Quote v2 with customer");
    await page.goto(`${oppUrl}?tab=quotes`);
    await expect(page.getByText("Superseded")).toBeVisible();
    await expect(page.getByText("With customer", { exact: true })).toBeVisible();

    await page.goto(oppUrl);
    await page.getByRole("button", { name: "Advance to Negotiation" }).click();
    await expect(page.getByText("Moved to Negotiation")).toBeVisible();
    await page.getByRole("button", { name: "Close as won" }).click();
    dlg = page.getByRole("dialog");
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

test.describe("Cost sources", () => {
  test("an own-brand resale deal is costed from the rate card and quoted without purchase", async ({ page }) => {
    await login(page, SALES);
    await page.goto("/opportunities/new");
    await page.fill("#name", `E2E Neon storage ${Date.now().toString().slice(-6)}`);
    await page.selectOption("#accountId", { label: "Zenith Capital Finance Ltd" });
    await page.getByRole("button", { name: "Pick an exact product" }).click();
    await page.getByRole("button", { name: "Remove line 1" }).click();
    await pickProduct(page, 0, "NEON-HST-02");
    await page.getByLabel("Line 1 quantity").fill("50");
    await page.getByRole("radio", { name: /No presales/ }).click();
    await page.fill("#nextStep", "Send the proposal");
    await page.click("button:has-text('Create opportunity')");
    await page.waitForURL((u) => /\/opportunities\/c[a-z0-9]{20,}$/.test(u.pathname));
    const url = new URL(page.url()).pathname;
    await page.getByRole("button", { name: "Advance to Qualified" }).click();
    await expect(page.getByText("Moved to Qualified")).toBeVisible();

    await page.goto(`${url}?tab=boq`);
    await expect(page.getByLabel("Line items").getByText("Rate card", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Deal status")).toContainText("Priced · ready to quote");
    // Nothing for purchase to price: the next step is the quote itself
    await page.getByRole("button", { name: "Advance to Proposal" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Gross margin %").fill("20"); // no sell prices yet: priced from the rate card cost
    await expect(dlg.getByText("20.0%")).toBeVisible();
    const popup = page.waitForEvent("popup");
    await dlg.getByRole("button", { name: "Create & send quote" }).click();
    await (await popup).close();
    await expect(page.getByLabel("Deal status")).toContainText("Quote v1 with customer");
    await expect(currentStage(page)).toHaveText("Proposal Submitted");
    // Presales can still be brought in after the quote went out; the dialog says the quote stays where it is
    await statusMenu(page, "Involve presales");
    const inv = page.getByRole("dialog");
    await expect(inv.getByText("Quote v1 stays with the customer. Send a revised quote once presales submits the BOQ.")).toBeVisible();
    await expect(inv.getByText(/moves .*BOQ stage/)).toHaveCount(0);
    await inv.getByRole("button", { name: "Cancel" }).click();
  });
});

test.describe("Bringing presales into a resale deal", () => {
  test("a resale deal already with purchase brings presales in: pricing stops and the deal goes back to BOQ", async ({ page }) => {
    await login(page, SALES);
    await page.goto("/opportunities/new");
    await page.fill("#name", `E2E Laptops ${Date.now().toString().slice(-6)}`);
    await page.selectOption("#accountId", { label: "Zenith Capital Finance Ltd" });
    await page.getByRole("button", { name: "Pick an exact product" }).click();
    await page.getByRole("button", { name: "Remove line 1" }).click();
    await pickProduct(page, 0, "LNV-NBK-01");
    await page.getByLabel("Line 1 quantity").fill("40");
    await expect(page.getByRole("radio", { name: /No presales/ })).toHaveAttribute("aria-checked", "true"); // laptops are resale
    await page.fill("#nextStep", "Get pricing");
    await page.click("button:has-text('Create opportunity')");
    await page.waitForURL((u) => /\/opportunities\/c[a-z0-9]{20,}$/.test(u.pathname));
    const url = new URL(page.url()).pathname;
    await page.getByRole("button", { name: "Advance to Qualified" }).click();
    await expect(page.getByText("Moved to Qualified")).toBeVisible();
    await expect(page.getByRole("list", { name: "Stage" })).not.toContainText("BOQ"); // resale path
    await page.getByRole("button", { name: "Advance to Pricing" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Send to purchase" }).click();
    await expect(page.getByText("Purchase notified")).toBeVisible();
    await expect(currentStage(page)).toHaveText("Pricing");

    // The path is not switched from the edit form once the deal is qualified
    await page.goto(`${url}/edit`);
    await expect(page.getByRole("radio", { name: /Needs presales/ })).toBeDisabled();
    await expect(page.getByText(/To bring presales in, use/)).toBeVisible();

    await page.goto(url);
    await statusMenu(page, "Involve presales");
    const dlg = page.getByRole("dialog");
    await expect(dlg.getByText(/pricing request is stopped/)).toBeVisible();
    await expect(dlg.getByText("The deal moves back to the BOQ stage.")).toBeVisible();
    await expect(dlg.getByText(/Presales starts from your 1 line item/)).toBeVisible();
    await dlg.locator("select[name=assignedToId]").selectOption({ label: PRESALES.name });
    await dlg.locator("textarea[name=scope]").fill("40 laptops with imaging, asset tagging and on-site deployment.");
    await dlg.getByRole("button", { name: "Send to presales" }).click();
    await expect(dlg.getByText("Say why presales is needed")).toBeVisible(); // a reason is required
    await dlg.locator("textarea[name=reason]").fill("Customer now wants imaging and on-site deployment.");
    await dlg.getByRole("button", { name: "Send to presales" }).click();
    await expect(page.getByText("Presales notified")).toBeVisible();
    await expect(currentStage(page)).toHaveText("BOQ");
    await expect(page.getByLabel("Deal status")).toContainText("BOQ with presales");

    await page.goto(`${url}?tab=history`);
    await expect(page.getByText("Solution · needs presales")).toBeVisible();
    await expect(page.getByText(/resale deal now needs presales/).first()).toBeVisible();

    // Presales starts from the lines sales built; only lines they change go back to purchase
    await login(page, PRESALES.email);
    await page.goto(`${url}?tab=boq`);
    await page.getByRole("button", { name: "Advance to Pricing" }).click();
    const sub = page.getByRole("dialog");
    await expect(sub.getByText("1 of 1 lines go to purchase")).toBeVisible(); // pricing was stopped before a cost came back
    await sub.locator("textarea[name=solutionSummary]").fill("Same laptops; imaging and deployment quoted as services later.");
    await sub.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("BOQ submitted. Purchase notified.")).toBeVisible();
    await expect(page.getByLabel("Deal status")).toContainText("Pricing with purchase");
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
    await page.goto("/opportunities?stage=NEGOTIATION");
    const hrefs = await page.locator("table a[href^='/opportunities/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
    // First Negotiation deal whose quote is with the customer and nothing is open with presales or purchase
    for (const href of hrefs) {
      await page.goto(href);
      if (await page.getByRole("button", { name: "Close as won" }).isEnabled()) break;
    }
    await page.getByRole("button", { name: "Close as won" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.locator("input[name=poNumber]").fill("");
    await dlg.getByRole("button", { name: "Mark as won" }).click();
    await expect(page.getByText(/PO number/).first()).toBeVisible();
  });

  test("unauthenticated API access is rejected", async ({ request }) => {
    const r = await request.get("/api/export/opportunities", { maxRedirects: 0 });
    expect(r.status()).toBe(401);
  });

  test("logo and favicon load before sign-in", async ({ request }) => {
    for (const path of ["/brand/progression-logo.png", "/brand/progression-logo-dark.png", "/brand/progression-mark.svg", "/favicon.ico", "/icon.svg", "/apple-icon.png"]) {
      const r = await request.get(path, { maxRedirects: 0 });
      expect(r.status(), path).toBe(200);
    }
  });
});

test.describe("Process guardrails", () => {
  test("a new deal cannot jump stages; hold needs a reason and resumes where it was; the edit form cannot change the stage", async ({ page }) => {
    await login(page, SALES);
    await page.goto("/opportunities/new");
    await expect(page.locator("#stage")).toHaveCount(0); // new deals always start at Identified
    const name = `E2E Guardrails ${Date.now().toString().slice(-6)}`;
    await page.fill("#name", name);
    await page.selectOption("#accountId", { label: "Zenith Capital Finance Ltd" });
    await page.getByLabel("Line 1 business unit").selectOption({ label: "IT Infrastructure" });
    await page.getByLabel("Line 1 category").selectOption({ label: "Server" });
    await page.getByLabel("Line 1 OEM").selectOption({ label: "Dell" });
    await page.getByLabel("Line 1 value").fill("1500000");
    await page.click("button:has-text('Create opportunity')");
    await page.waitForURL((u) => /\/opportunities\/c[a-z0-9]{20,}$/.test(u.pathname));
    const url = new URL(page.url()).pathname;

    const stages = page.getByRole("list", { name: "Stage" });
    // Stages show progress only; the one button advances to the next stage. Won is not on offer this early.
    await expect(stages.getByRole("button")).toHaveCount(0);
    await expect(stages.locator("li", { hasText: "Proposal Submitted" })).toHaveAttribute("title", /when the quote is sent/);
    await expect(page.getByRole("button", { name: "Advance to Qualified" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Close as won" })).toHaveCount(0);

    // Hold asks for a reason, then the only way back is to resume to the same stage
    await stageMenu(page, "Put on hold");
    await page.getByRole("dialog").locator("textarea[name=note]").fill("Customer budget frozen until April");
    await page.getByRole("dialog").getByRole("button", { name: "Put on hold" }).click();
    await expect(page.getByText("Moved to Hold")).toBeVisible();
    await expect(page.getByText("On hold: Customer budget frozen until April")).toBeVisible();
    await expect(currentStage(page)).toHaveText("Identified");
    await expect(page.getByRole("button", { name: "Advance to Qualified" })).toHaveCount(0);
    await page.getByRole("button", { name: "Resume to Identified" }).click();
    await expect(page.getByText("Moved to Identified")).toBeVisible();

    // The edit form shows the stage but cannot change it
    await page.goto(`${url}/edit`);
    await expect(page.locator("#stage")).toHaveCount(0);
    await expect(page.getByText("Moves through the stage bar on the deal")).toBeVisible();
    await expect(page.locator("#forecastCategory option[value=COMMIT]")).toBeDisabled();
  });

  test("a sales person cannot move a deal back or reopen a closed one", async ({ page }) => {
    await login(page, SALES);
    await page.goto("/opportunities?stage=BOQ,PRICING,PROPOSAL,NEGOTIATION");
    await page.locator("table a[href^='/opportunities/']").first().click();
    await page.getByRole("list", { name: "Stage" }).locator("xpath=..").getByRole("button", { name: "More", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: /Move back/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.goto("/opportunities?stage=WON,LOST,DROPPED");
    await page.locator("table a[href^='/opportunities/']").first().click();
    await expect(page.getByRole("button", { name: "Reopen" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
  });

  test("a stage is skipped only from inside it: BOQ is skipped once the deal is in BOQ", async ({ page }) => {
    await login(page, SALES);
    await page.goto("/opportunities/new");
    await page.fill("#name", `E2E Skip BOQ ${Date.now().toString().slice(-6)}`);
    await page.selectOption("#accountId", { label: "Zenith Capital Finance Ltd" });
    await page.getByRole("button", { name: "Pick an exact product" }).click();
    await page.getByRole("button", { name: "Remove line 1" }).click();
    await pickProduct(page, 0, "CSCO-NET-02");
    await page.click("button:has-text('Create opportunity')");
    await page.waitForURL((u) => /\/opportunities\/c[a-z0-9]{20,}$/.test(u.pathname));
    await page.getByRole("button", { name: "Advance to Qualified" }).click();
    await expect(page.getByText("Moved to Qualified")).toBeVisible();
    // Skipping is not offered before the deal reaches the stage
    await page.getByRole("list", { name: "Stage" }).locator("xpath=..").getByRole("button", { name: "More", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: /Skip BOQ/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Advance to BOQ" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.locator("select[name=assignedToId]").selectOption({ label: PRESALES.name });
    await dlg.locator("textarea[name=scope]").fill("Ten access switches, same as the existing branch standard.");
    await dlg.getByRole("button", { name: "Send to presales" }).click();
    await expect(currentStage(page)).toHaveText("BOQ");
    await stageMenu(page, "Skip BOQ (no presales needed)");
    await page.getByRole("dialog").locator("textarea[name=note]").fill("Standard branch switches; exact SKUs already on the deal");
    await page.getByRole("dialog").getByRole("button", { name: "Skip BOQ" }).click();
    await expect(page.getByText("BOQ skipped. The deal is in Pricing.")).toBeVisible();
    await expect(currentStage(page)).toHaveText("Pricing");
    await expect(page.getByRole("list", { name: "Stage" }).locator("li", { hasText: /^BOQ$/ })).toHaveCount(0); // now a resale path
    await expect(page.getByLabel("Deal status")).toContainText("Pricing not requested");
  });
});

test.describe("Deal setup", () => {
  test("the new deal form asks the minimum and each field follows the one before it", async ({ page }) => {
    await login(page, HEAD);
    await page.goto("/opportunities/new");
    // Nothing that is derived is asked for
    for (const f of ["#stage", "#probability", "#accountType", "#revenueModel", "#contractTermMonths", "#presalesOwnerId", "#forecastCategory"])
      await expect(page.locator(f)).toHaveCount(0);
    // Category follows the business unit, OEM follows the category
    await expect(page.getByLabel("Line 1 category")).toBeDisabled();
    await page.getByLabel("Line 1 business unit").selectOption({ label: "IT Infrastructure" });
    await expect(page.getByLabel("Line 1 category").locator("option")).toContainText(["Server", "Laptop", "Networking"]);
    await expect(page.getByLabel("Line 1 category").locator("option", { hasText: "SOC" })).toHaveCount(0);
    await page.getByLabel("Line 1 category").selectOption({ label: "Laptop" });
    await expect(page.getByLabel("Line 1 OEM").locator("optgroup[label='Usual for this category'] option")).toContainText(["Lenovo", "Dell"]);
    // Laptops are resale: no presales suggested
    await expect(page.getByRole("radio", { name: /No presales/ })).toHaveAttribute("aria-checked", "true");
    await page.getByLabel("Line 1 category").selectOption({ label: "Server" });
    await expect(page.getByRole("radio", { name: /Needs presales/ })).toHaveAttribute("aria-checked", "true");
    // Deal registration only for an OEM that runs it; the term only for recurring billing; the bid date only for RFP / tender
    await page.getByLabel("Line 1 OEM").selectOption({ label: "Dell" });
    await expect(page.locator("#dealRegStatus")).toBeVisible();
    await page.getByLabel("Line 1 OEM").selectOption({ label: "To be decided" });
    await expect(page.locator("#dealRegStatus")).toHaveCount(0);
    await expect(page.getByLabel("Line 1 term")).toHaveCount(0);
    await page.getByLabel("Line 1 billing").selectOption("RECURRING");
    await expect(page.getByLabel("Line 1 term")).toBeVisible();
    await expect(page.locator("#submissionDueDate")).toHaveCount(0);
    await page.getByRole("radio", { name: "RFP" }).click();
    await expect(page.locator("#submissionDueDate")).toBeVisible();
    // Deal type follows the account: a new logo is always new business
    await page.selectOption("#accountId", { label: "SwiftMove Logistics Pvt Ltd" });
    await expect(page.getByText("New logo · New business")).toBeVisible();
    await page.selectOption("#accountId", { label: "Zenith Capital Finance Ltd" });
    await expect(page.getByRole("radiogroup", { name: "Deal type" }).getByRole("radio")).toHaveText(["Upsell", "Cross-sell", "Renewal"]);
  });

  test("choosing No presales is respected everywhere, including a deal already in BOQ", async ({ page }) => {
    await login(page, SALES);
    // Created as resale even though servers would suggest presales
    await page.goto("/opportunities/new");
    await page.fill("#name", `E2E No Presales ${Date.now().toString().slice(-6)}`);
    await page.selectOption("#accountId", { label: "Zenith Capital Finance Ltd" });
    await page.getByLabel("Line 1 business unit").selectOption({ label: "IT Infrastructure" });
    await page.getByLabel("Line 1 category").selectOption({ label: "Server" });
    await page.getByLabel("Line 1 OEM").selectOption({ label: "Dell" });
    await page.getByLabel("Line 1 value").fill("2200000");
    await page.getByRole("radio", { name: /No presales/ }).click();
    await page.click("button:has-text('Create opportunity')");
    await page.waitForURL((u) => /\/opportunities\/c[a-z0-9]{20,}$/.test(u.pathname));
    const url = new URL(page.url()).pathname;
    await expect(page.getByText("Resale · no presales")).toBeVisible();
    await expect(page.getByRole("list", { name: "Stage" }).locator("li", { hasText: /^BOQ$/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Advance to Qualified" }).click();
    await expect(page.getByText("Moved to Qualified")).toBeVisible();
    await expect(page.getByRole("button", { name: /Advance to Pricing/ })).toBeVisible(); // straight to pricing, no BOQ
    await expect(page.getByRole("button", { name: "Advance to BOQ" })).toHaveCount(0);

    // A solution deal switched to No presales while it is in BOQ
    await page.goto("/opportunities/new");
    await page.fill("#name", `E2E Switch To Resale ${Date.now().toString().slice(-6)}`);
    await page.selectOption("#accountId", { label: "Zenith Capital Finance Ltd" });
    await page.getByLabel("Line 1 business unit").selectOption({ label: "IT Infrastructure" });
    await page.getByLabel("Line 1 category").selectOption({ label: "Server" });
    await page.getByLabel("Line 1 OEM").selectOption({ label: "Dell" });
    await page.getByLabel("Line 1 value").fill("2200000");
    await page.click("button:has-text('Create opportunity')");
    await page.waitForURL((u) => /\/opportunities\/c[a-z0-9]{20,}$/.test(u.pathname));
    const url2 = new URL(page.url()).pathname;
    await page.getByRole("button", { name: "Advance to Qualified" }).click();
    await expect(page.getByText("Moved to Qualified")).toBeVisible();
    await page.getByRole("button", { name: "Advance to BOQ" }).click();
    let dlg = page.getByRole("dialog");
    await dlg.locator("select[name=assignedToId]").selectOption({ label: PRESALES.name });
    await dlg.locator("textarea[name=scope]").fill("Two rack servers for the branch file store.");
    await dlg.getByRole("button", { name: "Send to presales" }).click();
    await expect(currentStage(page)).toHaveText("BOQ");
    await statusMenu(page, "Cancel BOQ request");
    dlg = page.getByRole("dialog");
    await dlg.locator("textarea[name=reason]").fill("Customer sent an exact bill of materials");
    await dlg.getByRole("button", { name: "Cancel request" }).click();
    await expect(page.getByText("Request cancelled")).toBeVisible();
    await page.goto(`${url2}/edit`);
    await page.getByRole("radio", { name: /No presales/ }).click();
    await page.click("button:has-text('Save changes')");
    await page.waitForURL((u) => u.pathname === url2);
    await expect(currentStage(page)).toHaveText("BOQ");
    await expect(page.getByLabel("Deal status")).toContainText("Estimate only · resale");
    await expect(page.getByLabel("Deal status").getByRole("link", { name: "Add products" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Advance to Pricing/ })).toBeDisabled();
    await page.getByRole("button", { name: /Advance to Pricing/ }).locator("xpath=..").hover();
    await expect(page.getByRole("tooltip").first()).toContainText("No presales on this deal");
    await expect(page.getByText(/Request a BOQ from presales/)).toHaveCount(0);
    expect(url).not.toBe(url2);
  });

  test("a resale deal skips presales: sales adds products and goes straight to pricing", async ({ page }) => {
    await login(page, SALES);
    await page.goto("/opportunities/new");
    const name = `E2E Resale Laptops ${Date.now().toString().slice(-6)}`;
    await page.fill("#name", name);
    await page.selectOption("#accountId", { label: "Zenith Capital Finance Ltd" });
    await page.getByLabel("Line 1 business unit").selectOption({ label: "IT Infrastructure" });
    await page.getByLabel("Line 1 category").selectOption({ label: "Laptop" });
    await page.getByLabel("Line 1 OEM").selectOption({ label: "Lenovo" });
    await page.getByLabel("Line 1 value").fill("1800000");
    await page.click("button:has-text('Create opportunity')");
    await page.waitForURL((u) => /\/opportunities\/c[a-z0-9]{20,}$/.test(u.pathname));
    await expect(page.getByLabel("Deal status")).toContainText("Estimate only · resale");
    await expect(page.getByLabel("Deal status").getByRole("link", { name: "Add products" })).toBeVisible();
    await expect(page.getByLabel("Deal status").getByRole("button", { name: "Request BOQ from presales" })).toHaveCount(0); // not the main path
    await expect(page.getByText("Resale · no presales")).toBeVisible();
  });
});

test.describe("Line items, navigation and filters", () => {
  test("a deal can start from a quick estimate; OEM lives on the line", async ({ page }) => {
    await login(page, SALES);
    await page.goto("/opportunities/new");
    await expect(page.locator("#oemId")).toHaveCount(0); // no OEM on the deal header
    const name = `E2E Estimate - Server Refresh ${Date.now().toString().slice(-6)}`;
    await page.fill("#name", name);
    await page.selectOption("#accountId", { label: "Zenith Capital Finance Ltd" });
    // Early on the OEM may not be known yet
    await page.getByLabel("Line 1 business unit").selectOption({ label: "IT Infrastructure" });
    await page.getByLabel("Line 1 category").selectOption({ label: "Server" });
    await page.getByLabel("Line 1 OEM").selectOption({ label: "To be decided" });
    await page.getByLabel("Line 1 value").fill("2500000");
    await page.click("button:has-text('Create opportunity')");
    await page.waitForURL((u) => /\/opportunities\/c[a-z0-9]{20,}$/.test(u.pathname));
    await expect(page.getByText("₹25 L").first()).toBeVisible();
    await page.goto(`${new URL(page.url()).pathname}?tab=boq`);
    await expect(page.getByText(/^Estimate ·/).first()).toBeVisible();
    await expect(page.getByText("Estimate only")).toBeVisible();
    await expect(page.getByText("To be decided").first()).toBeVisible();
  });

  test("dashboard tiles open the matching filtered list", async ({ page }) => {
    await login(page, HEAD);
    await page.getByRole("link", { name: /Commit · Q/ }).click();
    await expect(page).toHaveURL(/\/opportunities\?.*fc=COMMIT/);
    await expect(page.getByLabel("Active filters")).toContainText("Commit");
    await expect(page.getByLabel("Active filters")).toContainText("Open");
  });

  test("sidebar collapses with Ctrl+B and stays collapsed after reload", async ({ page }) => {
    await login(page, HEAD);
    await page.keyboard.press("Control+b");
    await expect(page.getByRole("button", { name: "Expand sidebar" }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Expand sidebar" }).first()).toBeVisible();
    await page.keyboard.press("Control+b");
    await expect(page.getByRole("button", { name: "Collapse sidebar" }).first()).toBeVisible();
  });
});

test.describe.serial("Pipeline review", () => {
  test("head reviews one sales person: one-click windows, quick edit from the deal dialog", async ({ page }) => {
    await login(page, HEAD);
    await page.goto("/reviews");
    await page.getByRole("button", { name: "Sales person", exact: true }).click();
    await page.getByRole("button", { name: "Rakesh Pawar", exact: true }).click();
    await expect(page).toHaveURL(/who=/);
    await expect(page.getByRole("heading", { name: "Pipeline review · Rakesh Pawar" })).toBeVisible();

    const thirty = page.getByRole("radio", { name: "30 days" });
    await thirty.click();
    await expect(thirty).toHaveAttribute("aria-checked", "true"); // registers on the first click
    await expect(page).toHaveURL(/since=30d/);
    await expect(page.getByText(/Changes since last 30 days/)).toBeVisible();
    await page.getByRole("radio", { name: /^Closed/ }).click();
    await expect(page.getByRole("radio", { name: /^Closed/ })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("radio", { name: "All", exact: true }).click();

    // Every listed deal belongs to Rakesh, so no owner is shown in the rows
    const first = page.locator("main button[aria-label^='Open ']").first();
    const name = (await first.getAttribute("aria-label"))!.replace(/^Open /, "");
    await first.click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByText(name).first()).toBeVisible();
    await expect(panel.getByText("Recent changes", { exact: true })).toBeVisible();
    await panel.getByLabel("Next step", { exact: true }).fill("E2E: agreed in review call");
    await panel.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Deal updated")).toBeVisible();
  });

  test("completing a review for one person records actions and resets only their baseline", async ({ page }) => {
    await login(page, HEAD);
    await page.goto("/reviews?since=last");
    await page.getByRole("button", { name: "Sales person", exact: true }).click();
    await page.getByRole("button", { name: "Rakesh Pawar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Pipeline review · Rakesh Pawar" })).toBeVisible();
    await page.getByRole("button", { name: "Complete review" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Action 1", { exact: true }).fill("E2E: send revised proposal");
    await dlg.getByRole("button", { name: "Complete review" }).click();
    await expect(page.getByText("Review recorded · 1 action assigned")).toBeVisible();
    await expect(page.getByText("E2E: send revised proposal")).toBeVisible();
    await expect(page.getByText(/Changes since Rakesh's last review/)).toBeVisible();
    await expect(page.getByText(/\(today\)/)).toBeVisible();

    // Another rep keeps their own baseline
    await page.getByRole("button", { name: "Next sales person" }).click();
    await expect(page.getByRole("heading", { name: /Pipeline review · (?!Rakesh Pawar)/ })).toBeVisible();
    await expect(page.getByText(/\(today\)/)).toHaveCount(0);
  });

  test("a sales person reviews only their own pipeline", async ({ page }) => {
    await login(page, SALES);
    await page.goto("/reviews?who=all");
    await expect(page.getByRole("heading", { name: "Pipeline review · Rakesh Pawar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sales person", exact: true })).toHaveCount(0);
  });
});

test.describe("Navigation", () => {
  // Regression: in production, a route-group loading.tsx stalled navigations that only change the query string
  test("filters and search on the same page apply on the first try", async ({ page }) => {
    await login(page, HEAD);
    await page.goto("/reports");
    await page.getByRole("button", { name: /^Period/ }).first().click();
    await page.getByRole("button", { name: /^Last quarter/ }).click();
    await expect(page).toHaveURL(/period=last-q/, { timeout: 8000 });

    await page.goto("/accounts");
    await page.getByRole("textbox").first().fill("Zenith");
    await expect(page).toHaveURL(/q=Zenith/, { timeout: 8000 });
    await expect(page.getByText("Zenith Capital Finance Ltd").first()).toBeVisible();

    await page.goto("/reviews");
    await page.getByRole("radio", { name: "14 days" }).click();
    await expect(page).toHaveURL(/since=14d/, { timeout: 8000 });
  });
});
