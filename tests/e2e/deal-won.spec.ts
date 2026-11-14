import { test, expect, type Page } from "@playwright/test";
import { go, createAccount, login, pdf, pickCombobox, pickSelect, signedIn, uid } from "./helpers";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

// One deal from creation to Closed-Won through every screen: sales → presales (BOQ) → purchase (prices) →
// proposal → negotiation → PO → won. Each hand-over is done by the person it belongs to.
let dealUrl = "";
const dealName = `Lifecycle deal ${uid()}`;

async function addLine(page: Page, fill: () => Promise<void>) {
  await page.getByRole("button", { name: "Add line" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await fill();
  await page.getByRole("button", { name: "Add line" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("sales creates the deal with three lines (catalogue, custom and recurring)", async ({ page }) => {
  await login(page, "rep");
  const account = await createAccount(page, `Lifecycle Corp ${uid()}`);
  await go(page, "/deals/new");
  await page.fill("#name", dealName);
  await pickCombobox(page, page.locator("#account"), account.name.slice(0, 14), new RegExp(account.name));
  await pickSelect(page, "Customer contact", /Test Contact/);
  await pickSelect(page, "Forecast", "Upside");

  // 1. catalogue product (third party): the product fixes BU, Sub BU and OEM
  await addLine(page, async () => {
    await pickCombobox(page, page.locator("#line-product"), "Dell 2U", /Dell 2U Rack Server/);
    await expect(page.getByLabel("OEM")).toBeDisabled();
    await page.fill("#line-quantity", "2");
    await page.fill("#line-unitSalesPrice", "1200000");
  });
  // 2. custom own-IP line: no sales method
  await addLine(page, async () => {
    await page.fill("#line-description", "Installation and commissioning");
    await pickSelect(page, "Business unit", "Services");
    await pickSelect(page, "Sub BU", "FMS");
    await pickSelect(page, "OEM", "Progression");
    await expect(page.getByLabel("Sales method")).toBeDisabled();
    await page.fill("#line-unitSalesPrice", "200000");
  });
  // 3. recurring line from the catalogue
  await addLine(page, async () => {
    await pickCombobox(page, page.locator("#line-product"), "Neon Cloud Virtual", /Neon Cloud Virtual compute pool/);
    await expect(page.getByRole("radio", { name: "Recurring (ARR)" })).toHaveAttribute("data-state", "on");
    await page.fill("#line-termMonths", "12");
    await page.fill("#line-unitSalesPrice", "600000");
  });
  await expect(page.getByRole("row")).toHaveCount(4); // header + 3 lines
  await expect(page.getByText("Value ₹32 L")).toBeVisible();
  // The Server Sub BU suggests presales
  await expect(page.getByRole("switch", { name: /Needs presales/ })).toHaveAttribute("data-state", "checked");

  await page.getByRole("button", { name: "Create deal" }).click();
  await expect(page).toHaveURL(/\/deals\/[0-9a-f-]+$/);
  dealUrl = page.url();
  await expect(page.getByText("Qualified", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: /Lines 3/ })).toBeVisible();
});

test("sales advances to BOQ, which raises a presales request", async ({ page }) => {
  await login(page, "rep");
  await go(page, dealUrl);
  await page.getByRole("button", { name: "Advance to BOQ" }).click();
  await pickSelect(page, "Presales engineer", "Rakesh Yadav");
  await page.fill("#mv-scope", "Size the server BOQ with the customer's IT team");
  await page.getByRole("dialog").getByRole("button", { name: "Advance to BOQ" }).click();
  await expect(page.getByText("Moved to BOQ")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("BOQ", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Rakesh Yadav").first()).toBeVisible();
  await expect(page.getByText("Requested", { exact: true })).toBeVisible();
  // The next step on the path is gated until presales submits
  await expect(page.getByRole("button", { name: "Advance to Proposal Submitted" })).toBeDisabled();
});

test("presales sees the deal without prices, costs the own-IP line and submits the BOQ", async ({ browser }) => {
  const { context, page } = await signedIn(browser, "presales");
  await go(page, "/my-work");
  await expect(page.getByRole("link", { name: dealName })).toBeVisible();
  await go(page, dealUrl + "?tab=lines");
  await expect(page.locator("table thead tr").first()).toContainText("Cost");
  await expect(page.locator("table thead tr").first()).not.toContainText("Sales price");
  // Edit the own-IP line: presales may set its cost
  await page.getByRole("button", { name: "Edit line 2" }).click();
  await page.fill("#line-unitPurchaseCost", "120000");
  await page.getByRole("button", { name: "Save line" }).click();
  await expect(page.getByText("Line saved")).toBeVisible();
  await page.getByRole("tab", { name: "Overview" }).click();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("In progress", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Submit BOQ" }).click();
  await page.fill("#reason", "Sized with the customer: 2 servers, 12 months of compute");
  await page.getByRole("dialog").getByRole("button", { name: "Submit BOQ" }).click();
  await expect(page.getByText("BOQ submitted")).toBeVisible();
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
  await context.close();
});

test("sales asks purchase for prices; purchase costs the third-party line and completes", async ({ browser }) => {
  const rep = await signedIn(browser, "rep");
  await go(rep.page, dealUrl);
  await rep.page.getByRole("button", { name: "Ask for prices" }).click();
  await pickSelect(rep.page, "Buyer", "Meera Iyer");
  await rep.page.getByRole("button", { name: "Raise request" }).click();
  await expect(rep.page.getByText("Pricing request raised")).toBeVisible();
  await rep.context.close();

  const buyer = await signedIn(browser, "purchase");
  await go(buyer.page, "/my-work");
  await expect(buyer.page.getByRole("link", { name: dealName })).toBeVisible();
  await go(buyer.page, dealUrl);
  await buyer.page.getByRole("button", { name: "Start" }).click();
  await expect(buyer.page.getByText("Started")).toBeVisible();
  // Completing before every third-party line is costed is refused
  await buyer.page.getByRole("button", { name: "Complete pricing" }).click();
  await buyer.page.fill("#reason", "Best supplier price, 30-day validity");
  await buyer.page.getByRole("dialog").getByRole("button", { name: "Complete pricing" }).click();
  await expect(buyer.page.getByText(/Enter the purchase cost on line/)).toBeVisible();
  await buyer.page.keyboard.press("Escape");
  await buyer.page.getByRole("tab", { name: /Lines/ }).click();
  await buyer.page.getByRole("button", { name: "Edit line 1" }).click();
  await expect(buyer.page.locator("#line-description")).toBeDisabled();
  await buyer.page.fill("#line-unitPurchaseCost", "1000000");
  await buyer.page.getByRole("button", { name: "Save line" }).click();
  await expect(buyer.page.getByText("Line saved")).toBeVisible();
  await buyer.page.getByRole("tab", { name: "Overview" }).click();
  await buyer.page.getByRole("button", { name: "Complete pricing" }).click();
  await buyer.page.fill("#reason", "Best supplier price, 30-day validity");
  await buyer.page.getByRole("dialog").getByRole("button", { name: "Complete pricing" }).click();
  await expect(buyer.page.getByText("Pricing completed")).toBeVisible();
  await expect(buyer.page.getByText("Completed", { exact: true })).toBeVisible();
  await buyer.context.close();
});

test("sales sends the proposal, negotiates, attaches the PO and closes as won; history has every date", async ({ page }) => {
  await login(page, "rep");
  await go(page, dealUrl);
  await expect(page.getByText(/Expected GM/)).toBeVisible();
  await page.getByRole("button", { name: "Advance to Proposal Submitted" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Advance to Proposal Submitted" }).click();
  await expect(page.getByText("Moved to Proposal Submitted")).toBeVisible();
  await page.getByRole("button", { name: "Advance to Negotiation" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Advance to Negotiation" }).click();
  await expect(page.getByText("Moved to Negotiation")).toBeVisible();

  // Won needs the customer's PO on file
  await expect(page.getByRole("button", { name: "Close as won" })).toBeDisabled();
  await page.getByRole("tab", { name: /Documents/ }).click();
  await page.getByRole("button", { name: "Upload document" }).first().click();
  await pickSelect(page, "Kind", "Customer PO");
  await page.locator("#doc-file").setInputFiles(pdf("customer-po.pdf"));
  await page.fill("#doc-desc", "Signed PO");
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText("Document uploaded")).toBeVisible();
  await expect(page.getByText("customer-po.pdf")).toBeVisible();

  await page.getByRole("button", { name: "Close as won" }).click();
  await page.fill("#mv-po", "PO/LIFE/2026/001");
  await page.getByRole("dialog").getByRole("button", { name: "Close as won" }).click();
  await expect(page.getByText("Deal closed as won")).toBeVisible();
  await expect(page.getByText("Closed-Won", { exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.getByText("PO/LIFE/2026/001")).toBeVisible();
  // Closed deals can't be edited
  await expect(page.getByRole("button", { name: /Advance/ })).toHaveCount(0);

  await page.getByRole("tab", { name: "History" }).click();
  const stageList = page.getByRole("list", { name: "Stage history" }).or(page.locator("section[aria-label='Stage history'] ol"));
  await expect(stageList.getByRole("listitem")).toHaveCount(5);
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });
  await expect(stageList.getByText(today).first()).toBeVisible();
  for (const label of ["Qualified", "BOQ", "Proposal Submitted", "Negotiation", "Closed-Won"]) await expect(stageList.getByText(label, { exact: true }).first()).toBeVisible();
});
