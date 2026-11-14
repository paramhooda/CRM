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
    await page.fill("#line-unitSalesPrice", "2000000"); // above the pool's standard cost, so no margin rule trips later
  });
  await expect(page.getByRole("row")).toHaveCount(4); // header + 3 lines
  await expect(page.getByText("Value ₹46 L")).toBeVisible();
  // The Server Sub BU suggests presales
  await expect(page.getByRole("switch", { name: /Needs presales/ })).toHaveAttribute("data-state", "checked");

  await page.getByRole("button", { name: "Create deal" }).click();
  await expect(page).toHaveURL(/\/deals\/[0-9a-f-]+$/);
  dealUrl = page.url();
  await expect(page.getByText("Qualified", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: /Lines 3/ })).toBeVisible();
});

const headline = (page: Page) => page.locator("[data-slot=next-headline]");
const panel = (page: Page) => page.getByRole("region", { name: "What's next" });

test("sales is told to attach the customer's requirement; Advance to BOQ takes the document and hands over to presales", async ({ page }) => {
  await login(page, "rep");
  await go(page, dealUrl);
  // The panel says what is missing; the hero button still opens the hand-over, which asks for the document itself
  await expect(headline(page)).toHaveText(/Your next step: attach the customer's requirement/);
  await expect(panel(page).getByRole("button", { name: "Attach document" })).toBeVisible();
  await page.getByRole("button", { name: "Advance to BOQ" }).click();
  await pickSelect(page, "Presales engineer", "Rakesh Yadav");
  // Scope and the document are both required
  await page.getByRole("dialog").getByRole("button", { name: "Advance to BOQ" }).click();
  await expect(page.getByText("Say what presales should size and specify.")).toBeVisible();
  await expect(page.getByText("Attach the customer's requirement.")).toBeVisible();
  await page.fill("#mv-scope", "Size the server BOQ with the customer's IT team");
  await pickSelect(page, "Kind", "Customer RFP");
  await page.locator("#mv-doc-file").setInputFiles(pdf("customer-rfp.pdf"));
  await page.getByRole("dialog").getByRole("button", { name: "Advance to BOQ" }).click();
  await expect(page.getByText("Moved to BOQ")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("BOQ", { exact: true }).first()).toBeVisible();
  await expect(headline(page)).toHaveText("Waiting on presales (Rakesh Yadav): submit the BOQ");
  await expect(page.getByRole("tab", { name: /Documents 1/ })).toBeVisible();
  // The next step on the path is gated until presales submits, and the lines are presales' now
  await expect(page.getByRole("button", { name: "Advance to Proposal Submitted" })).toBeDisabled();
  await page.getByRole("tab", { name: /Lines/ }).click();
  await expect(page.getByRole("button", { name: "Edit line 1" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add line" })).toHaveCount(0);
});

test("presales lands on the deal from My work (opening it starts the request), costs the own-IP line and submits the BOQ to purchase, never seeing a price", async ({ browser }) => {
  const { context, page } = await signedIn(browser, "presales");
  await go(page, "/my-work");
  const row = page.locator("section[aria-label='Open requests']").getByText(dealName).locator("xpath=ancestor::div[contains(@class,'flex-wrap')][1]");
  await expect(row.locator("[data-slot=todo]")).toHaveText("Not started");
  await row.getByRole("link", { name: "Open deal" }).click();
  await expect(page).toHaveURL(dealUrl);
  await expect(headline(page)).toHaveText("Your next step: submit the BOQ");
  await expect(page.getByText("Expected GM")).toHaveCount(0);
  // opening the deal started the request: no Start button anywhere
  await expect(page.getByRole("button", { name: "Start", exact: true })).toHaveCount(0);
  await expect(page.getByText("In progress", { exact: true })).toBeVisible();
  // Edit the own-IP line: presales may set its cost
  await page.getByRole("tab", { name: /Lines/ }).click();
  await expect(page.locator("table thead tr").first()).toContainText("Cost");
  await expect(page.locator("table thead tr").first()).not.toContainText("Sales price");
  await page.getByRole("button", { name: "Edit line 2" }).click();
  await page.fill("#line-unitPurchaseCost", "120000");
  await page.getByRole("button", { name: "Save line" }).click();
  await expect(page.getByText("Line saved")).toBeVisible();
  await panel(page).getByRole("button", { name: "Submit BOQ" }).click();
  await page.fill("#reason", "Sized with the customer: 2 servers, 12 months of compute");
  // the Dell server line still needs a cost, so submitting names the buyer and asks purchase in the same step
  await expect(page.getByRole("dialog").getByText(/third-party line still needs a purchase cost/)).toBeVisible();
  await pickSelect(page, "Buyer", "Meera Iyer");
  await page.getByRole("dialog").getByRole("button", { name: "Submit BOQ and ask purchase" }).click();
  await expect(page.getByText("BOQ submitted and sent to purchase")).toBeVisible();
  await expect(headline(page)).toHaveText(/Waiting on purchase \(Meera Iyer\)/);
  // Handed over: no more editing for presales
  await page.getByRole("tab", { name: /Lines/ }).click();
  await expect(page.getByRole("button", { name: "Edit line 1" })).toHaveCount(0);
  await context.close();
});

test("sales sees purchase has the deal; purchase is told which lines to cost and can only complete once they are", async ({ browser }) => {
  const rep = await signedIn(browser, "rep");
  await go(rep.page, "/home");
  // nothing on the rep: the deal is with purchase
  await expect(rep.page.locator("[data-slot=needs-you]").getByText(dealName)).toHaveCount(0);
  await go(rep.page, dealUrl);
  await expect(headline(rep.page)).toHaveText("Waiting on purchase (Meera Iyer): enter the purchase cost on the remaining line and complete pricing");
  // While purchase prices, sales can still price but not change what is sold
  await rep.page.getByRole("tab", { name: /Lines/ }).click();
  await expect(rep.page.getByRole("button", { name: "Add line" })).toHaveCount(0);
  await rep.page.getByRole("button", { name: "Edit line 1" }).click();
  await expect(rep.page.locator("#line-quantity")).toBeDisabled();
  await expect(rep.page.locator("#line-unitSalesPrice")).toBeEnabled();
  await rep.page.keyboard.press("Escape");
  await rep.context.close();

  const buyer = await signedIn(browser, "purchase");
  await go(buyer.page, "/my-work");
  await buyer.page.locator("section[aria-label='Open requests']").getByText(dealName).locator("xpath=ancestor::div[contains(@class,'flex-wrap')][1]").getByRole("link", { name: "Open deal" }).click();
  await expect(headline(buyer.page)).toHaveText("Your next step: enter the purchase cost on the remaining line and complete pricing");
  await expect(buyer.page.getByText("In progress", { exact: true })).toBeVisible(); // opening it started the request
  // Complete is held back, with the reason, until the third-party line is costed
  await expect(buyer.page.getByRole("button", { name: "Complete pricing" }).first()).toBeDisabled();
  await expect(buyer.page.getByText("Enter the purchase cost on the remaining line first.").first()).toBeVisible();
  await buyer.page.getByRole("tab", { name: /Lines/ }).click();
  await expect(buyer.page.getByText("No cost")).toHaveCount(1);
  await buyer.page.getByRole("button", { name: "Edit line 1" }).click();
  await expect(buyer.page.locator("#line-description")).toBeDisabled();
  await buyer.page.fill("#line-unitPurchaseCost", "1000000");
  await buyer.page.getByRole("button", { name: "Save line" }).click();
  await expect(buyer.page.getByText("Line saved")).toBeVisible();
  await expect(headline(buyer.page)).toHaveText("Your next step: complete pricing");
  await panel(buyer.page).getByRole("button", { name: "Complete pricing" }).click();
  await buyer.page.fill("#reason", "Best supplier price, 30-day validity");
  await buyer.page.getByRole("dialog").getByRole("button", { name: "Complete pricing" }).click();
  await expect(buyer.page.getByText("Pricing completed")).toBeVisible();
  await expect(headline(buyer.page)).toHaveText(/Waiting on sales/);
  await buyer.context.close();
});

test("sales follows the panel: proposal, negotiation, PO and won; history has every date", async ({ page }) => {
  await login(page, "rep");
  await go(page, dealUrl);
  await expect(page.getByText(/Expected GM/)).toBeVisible();
  await expect(headline(page)).toHaveText("Your next step: advance to Proposal Submitted");
  await panel(page).getByRole("button", { name: "Advance to Proposal Submitted" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Advance to Proposal Submitted" }).click();
  await expect(page.getByText("Moved to Proposal Submitted")).toBeVisible();
  await expect(headline(page)).toHaveText("Your next step: attach the customer's PO under Documents");
  // Requests are over: nothing invites one now
  await expect(page.getByRole("button", { name: "Ask presales" })).toHaveCount(0);
  await page.getByRole("button", { name: "Advance to Negotiation" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Advance to Negotiation" }).click();
  await expect(page.getByText("Moved to Negotiation")).toBeVisible();

  // Won needs the customer's PO on file: the panel attaches it with the kind preselected
  await expect(page.getByRole("button", { name: "Close as won" }).first()).toBeDisabled();
  await panel(page).getByRole("button", { name: "Attach PO" }).click();
  await expect(page.getByRole("dialog").getByLabel("Kind")).toContainText("Customer PO");
  await page.locator("#doc-file").setInputFiles(pdf("customer-po.pdf"));
  await page.fill("#doc-desc", "Signed PO");
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText("Document uploaded")).toBeVisible();
  await expect(headline(page)).toHaveText("Your next step: close as won (enter the PO number)");

  await panel(page).getByRole("button", { name: "Close as won" }).click();
  await page.fill("#mv-po", "PO/LIFE/2026/001");
  await page.getByRole("dialog").getByRole("button", { name: "Close as won" }).click();
  await expect(page.getByText("Deal closed as won")).toBeVisible();
  await expect(page.getByText("Closed-Won", { exact: true }).first()).toBeVisible();
  await expect(headline(page)).toHaveText(/^Won\./);
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
