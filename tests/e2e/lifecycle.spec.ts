// Lead to closure, with the guardrails that keep billing honest:
// lead → convert → products → pricing (with a BOQ sheet attached) → purchase prices it (supplier quote attached) →
// quote → customer asks for changes → Won is refused → quantity changes → purchase must confirm the changed line →
// revised quote → accepted → Won needs the PO file → won. Then: one PO is billed once, reopening clears the PO,
// hold blocks quoting, and deactivating someone with open work hands it over.
import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "Progression@123";
const SALES = "rakesh.pawar@progression.com";
const HEAD = "vivek.malhotra@progression.com";
const ADMIN = "admin@progression.com";
const PURCHASE = "meera.iyer@progression.com";
const stamp = Date.now().toString().slice(-7);
const company = `E2E Lifecycle Traders ${stamp}`;
const PO = `PO/LC/${stamp}`;
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4 ${name}`) });

async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/dashboard/);
}
async function stageMenu(page: Page, item: string) {
  await page.getByRole("list", { name: "Stage" }).locator("xpath=..").getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: item }).click();
}
const currentStage = (page: Page) => page.getByRole("list", { name: "Stage" }).locator("[aria-current=step]");

test.describe.serial("Lead to closure", () => {
  let dealUrl = "";

  test("a qualified lead converts once into a deal with its contact", async ({ page }) => {
    await login(page, SALES);
    await page.goto("/leads");
    await page.getByRole("button", { name: "New lead" }).click();
    let dlg = page.getByRole("dialog");
    await dlg.locator("input[name=firstName]").fill("Asha");
    await dlg.locator("input[name=lastName]").fill("Verma");
    await dlg.locator("input[name=company]").fill(company);
    await dlg.locator("input[name=email]").fill(`asha.${stamp}@lifecycle.example`);
    await dlg.getByRole("button", { name: /More details/ }).click();
    await dlg.locator("select[name=status]").selectOption("QUALIFIED");
    await dlg.locator("textarea[name=requirement]").fill("40 laptops for the new branch");
    await dlg.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Lead saved")).toBeVisible();

    await page.getByRole("row", { name: new RegExp(company) }).getByRole("button", { name: "Convert" }).click();
    dlg = page.getByRole("dialog");
    await dlg.locator("select[name=categoryId]").selectOption({ label: "IT Infrastructure · Laptop" });
    // Laptops are resale: the presales tick follows the category and can be changed
    await expect(dlg.getByLabel("Needs presales")).not.toBeChecked();
    await dlg.locator("select[name=oemId]").selectOption({ label: "Lenovo" });
    await dlg.locator("input[name=amount]").fill("2400000");
    await dlg.getByRole("button", { name: "Convert" }).click();
    await page.waitForURL((u) => /\/opportunities\/c[a-z0-9]{20,}$/.test(u.pathname));
    dealUrl = new URL(page.url()).pathname;
    await expect(currentStage(page)).toHaveText("Qualified");

    // The lead now links to the deal and can't be converted again
    await page.goto("/leads?status=CONVERTED");
    const row = page.getByRole("row", { name: new RegExp(company) });
    await expect(row.getByRole("link", { name: "View deal" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Convert" })).toHaveCount(0);
  });

  test("sales prices the laptops through purchase, with documents attached at each hand-over", async ({ page }) => {
    await login(page, SALES);
    await page.goto(`${dealUrl}?tab=boq`);
    await page.getByRole("button", { name: "Edit line items" }).click();
    await page.getByRole("button", { name: "Product", exact: true }).first().click();
    await page.getByPlaceholder("Search SKU, product, OEM or category").fill("LNV-NBK-01");
    await page.getByRole("button", { name: /LNV-NBK-01/ }).click();
    await page.getByLabel("Line 1 quantity").fill("40");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Line items saved")).toBeVisible();

    await page.getByRole("button", { name: "Advance to Pricing" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("button", { name: /More options/ }).click();
    await dlg.getByLabel("Attach documents").setInputFiles(pdf("Laptop spec sheet.pdf"));
    await expect(dlg.getByText("Laptop spec sheet.pdf")).toBeVisible();
    await dlg.getByRole("button", { name: "Send to purchase" }).click();
    await expect(page.getByText("Purchase notified")).toBeVisible();
    await expect(currentStage(page)).toHaveText("Pricing");
    await page.goto(`${dealUrl}?tab=documents`);
    await expect(page.getByLabel("Documents").getByText("Laptop spec sheet.pdf", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Documents").getByText("Pricing request")).toBeVisible();

    await login(page, PURCHASE);
    await page.goto(`${dealUrl}?tab=boq`);
    await page.getByRole("button", { name: "Enter costs" }).click();
    await page.getByLabel("Line 1 unit cost").fill("52000");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Line items saved")).toBeVisible();
    await page.getByLabel("Deal status").getByRole("button", { name: "Pricing complete" }).click();
    const done = page.getByRole("dialog");
    // The priced line needs a supplier quote; a quote picked here covers the open lines
    await expect(done.getByLabel("Quote coverage")).toContainText("○ Line 1");
    await done.getByRole("button", { name: "Send to sales" }).click();
    await expect(done.getByText(/Attach the supplier quote for line 1/)).toBeVisible();
    await done.getByLabel("Add supplier quotes").setInputFiles(pdf("Redington quote R-2231.pdf"));
    await expect(done.getByLabel("Quote coverage")).toContainText("✓ Line 1");
    await done.getByRole("button", { name: "Send to sales" }).click();
    await expect(page.getByText("Pricing sent to sales")).toBeVisible();
    await page.goto(`${dealUrl}?tab=documents`);
    await expect(page.getByLabel("Documents").getByText("Redington quote R-2231.pdf", { exact: true })).toBeVisible();
  });

  test("won is refused until the quote matches the deal, and a changed line must be re-confirmed by purchase", async ({ page }) => {
    await login(page, SALES);
    await page.goto(dealUrl);
    // Purchase priced it: the owner sets the sales price against the purchase price and sends the quote
    await page.getByRole("button", { name: "Advance to Proposal" }).click();
    let dlg = page.getByRole("dialog");
    await expect(dlg.getByRole("columnheader", { name: "Purchase price" })).toBeVisible();
    await dlg.getByLabel("Line 1 GM %").fill("12");
    await expect(dlg.getByLabel("Line 1 sales price")).toHaveValue("59090.91"); // 52,000 at 12% GM
    await expect(dlg.getByLabel("GM summary")).toContainText("12.0%");
    const popup = page.waitForEvent("popup");
    await dlg.getByRole("button", { name: "Create & send quote" }).click();
    await (await popup).close();
    await expect(page.getByLabel("Deal status")).toContainText("Quote v1 with customer");

    await page.getByRole("button", { name: "Record customer response" }).click();
    dlg = page.getByRole("dialog");
    await dlg.getByRole("radio", { name: "Wants changes" }).click();
    await dlg.locator("textarea[name=note]").fill("They want 45 laptops, not 40");
    await dlg.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Response recorded")).toBeVisible();
    await page.getByRole("button", { name: "Advance to Negotiation" }).click();
    await expect(page.getByText("Moved to Negotiation")).toBeVisible();
    // The customer asked for changes: no PO can be recorded against that quote
    await expect(page.getByRole("button", { name: /Close as won \(not available: The customer asked for changes/ })).toBeVisible();

    // Sales changes the quantity; the line needs a supplier price again and re-pricing is one click away
    await page.goto(`${dealUrl}?tab=boq`);
    await page.getByRole("button", { name: "Edit line items" }).click();
    await page.getByLabel("Line 1 quantity").fill("45");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Line items saved")).toBeVisible();
    await expect(page.getByText("Needs re-pricing")).toBeVisible();
    await page.getByLabel("Deal status").getByRole("button", { name: "Request re-pricing" }).click();
    dlg = page.getByRole("dialog");
    await dlg.locator("textarea[name=reason]").fill("Quantity 40 → 45");
    await dlg.getByRole("button", { name: "Send to purchase" }).click();
    await expect(page.getByText("Purchase notified")).toBeVisible();
    // A re-pricing follows the usual path: the deal goes back to Pricing until the revised quote goes out
    await expect(currentStage(page)).toHaveText("Pricing");

    // Purchase can't pass the old cost through: Pricing complete waits until the line is re-costed or confirmed
    await login(page, PURCHASE);
    await page.goto(`${dealUrl}?tab=boq`);
    await expect(page.getByLabel("Deal status").getByRole("button", { name: "Pricing complete" })).toBeDisabled();
    await page.getByRole("button", { name: "Enter costs" }).click();
    await page.getByLabel("Line 1 price unchanged").check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Line items saved")).toBeVisible();
    await page.getByLabel("Deal status").getByRole("button", { name: "Pricing complete" }).click();
    dlg = page.getByRole("dialog");
    // The confirmed price needs the supplier's quote for the new quantity
    await dlg.getByLabel("Add supplier quotes").setInputFiles(pdf("Redington quote R-2240.pdf"));
    await dlg.getByRole("button", { name: "Send to sales" }).click();
    await expect(page.getByText("Pricing sent to sales")).toBeVisible();

    // The owner is told to re-check the prices; the table shows what changed since the quote
    await login(page, SALES);
    await page.goto(dealUrl);
    await expect(page.getByLabel("Deal status")).toContainText("Revised pricing ready");
    await page.getByRole("button", { name: "Advance to Proposal" }).click(); // back in Pricing, the revised quote is the next step
    dlg = page.getByRole("dialog");
    await expect(dlg.getByText(/Changed since quote v1: qty was 40/)).toBeVisible();
    const popup2 = page.waitForEvent("popup");
    await dlg.getByRole("button", { name: "Send revised quote" }).click();
    await (await popup2).close();
    await expect(page.getByLabel("Deal status")).toContainText("Quote v2 with customer");
    await expect(currentStage(page)).toHaveText("Proposal Submitted");
    await page.getByRole("button", { name: "Record customer response" }).click();
    dlg = page.getByRole("dialog");
    await dlg.getByRole("button", { name: "Save" }).click(); // Accepted is the default
    await expect(page.getByText("Response recorded")).toBeVisible();

    // The PO: number and the document itself
    await page.getByRole("button", { name: "Close as won" }).click();
    dlg = page.getByRole("dialog");
    await dlg.locator("input[name=poNumber]").fill(PO);
    await dlg.getByRole("button", { name: "Mark as won" }).click();
    await expect(dlg.getByText("Attach the customer's PO")).toBeVisible();
    await dlg.getByLabel("Customer PO", { exact: true }).setInputFiles(pdf(`${PO.replace(/\//g, "-")}.pdf`));
    await dlg.getByRole("button", { name: "Mark as won" }).click();
    await expect(page.getByText("Moved to Closed-Won")).toBeVisible();
    await page.goto(`${dealUrl}?tab=quotes`);
    await expect(page.getByText("Accepted").first()).toBeVisible();
  });

  test("one PO number closes one deal", async ({ page }) => {
    await login(page, HEAD);
    await page.goto("/opportunities?stage=NEGOTIATION");
    const hrefs = await page.locator("table a[href^='/opportunities/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
    let found = false;
    for (const href of hrefs) {
      await page.goto(href);
      if (await page.getByRole("button", { name: "Close as won", exact: true }).isVisible()) { found = true; break; }
    }
    expect(found).toBe(true);
    await page.getByRole("button", { name: "Close as won", exact: true }).click();
    const dlg = page.getByRole("dialog");
    await dlg.locator("input[name=poNumber]").fill(PO.toLowerCase());
    await dlg.getByLabel("Customer PO", { exact: true }).setInputFiles(pdf("duplicate-po.pdf"));
    await dlg.getByRole("button", { name: "Mark as won" }).click();
    await expect(page.getByText(/is already recorded on/)).toBeVisible();
  });

  test("reopening a won deal forgets its PO; closing as lost needs a reason", async ({ page }) => {
    await login(page, HEAD);
    await page.goto(dealUrl);
    // It was won from Proposal Submitted (the revised quote brought it back there): reopening returns it there
    await stageMenu(page, "Reopen to Proposal Submitted");
    let dlg = page.getByRole("dialog");
    await dlg.locator("textarea[name=note]").fill("PO was cancelled by the customer");
    await dlg.getByRole("button", { name: "Reopen" }).click();
    await expect(page.getByText("Moved to Proposal Submitted")).toBeVisible();
    await page.goto(`${dealUrl}?tab=history`);
    await expect(page.getByText(PO).first()).toBeVisible(); // the history keeps what happened
    await page.goto(dealUrl);
    await expect(page.getByLabel("Deal status")).not.toContainText(PO);
    await stageMenu(page, "Close as lost");
    dlg = page.getByRole("dialog");
    await expect(dlg.getByLabel("Reason")).toHaveAttribute("required", "");
    await dlg.getByLabel("Reason").selectOption("Price");
    await dlg.getByRole("button", { name: "Close as lost" }).click();
    await expect(page.getByText("Moved to Closed-Lost")).toBeVisible();
  });

  test("a held deal can't be quoted; resuming brings it back", async ({ page }) => {
    await login(page, HEAD);
    await page.goto("/opportunities?stage=PROPOSAL");
    await page.locator("table a[href^='/opportunities/']").first().click();
    await page.waitForURL(/\/opportunities\/c/);
    await stageMenu(page, "Put on hold");
    const dlg = page.getByRole("dialog");
    await dlg.locator("textarea[name=note]").fill("Customer budget frozen until April");
    await dlg.getByRole("button", { name: "Put on hold" }).click();
    await expect(page.getByText("Moved to Hold")).toBeVisible();
    await expect(page.getByLabel("Deal status")).toContainText("The deal is on hold");
    await expect(page.getByLabel("Deal status").getByRole("button", { name: /quote/i })).toHaveCount(0);
    await page.getByRole("button", { name: /^Resume to/ }).click();
    const resume = page.getByRole("dialog");
    if (await resume.isVisible().catch(() => false)) {
      // The close date passed while it was held: a new one is asked for
      const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
      await resume.locator("input[name=expectedCloseDate]").fill(future);
      await resume.getByRole("button", { name: "Resume" }).click();
    }
    await expect(page.getByText("Moved to Proposal Submitted")).toBeVisible();
  });

  test("deactivating someone with open work requires a hand-over", async ({ page }) => {
    await login(page, ADMIN);
    // Two presales engineers hand work to each other, so the test works on any run: whoever holds work now leaves
    const pair = [["Amit Rampal", "Ramraj Yadav"], ["Ramraj Yadav", "Amit Rampal"]] as const;
    let done = false;
    for (const [leaving, successor] of pair) {
      await page.goto("/admin?tab=users");
      await page.getByRole("row", { name: new RegExp(leaving) }).getByRole("button", { name: "Edit user" }).click();
      const dlg = page.getByRole("dialog");
      await dlg.getByRole("checkbox", { name: /Active/ }).uncheck();
      if (!(await dlg.getByLabel("Hand over to").isVisible())) {
        await dlg.getByRole("button", { name: "Cancel" }).click();
        continue;
      }
      await dlg.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText(/still has open work/)).toBeVisible();
      await dlg.getByLabel("Hand over to").selectOption({ label: `${successor} · Presales` });
      await dlg.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText(new RegExp(`moved to ${successor}`))).toBeVisible();

      // Back to active for the other tests; nothing is left to hand over now
      await page.getByRole("row", { name: new RegExp(leaving) }).getByRole("button", { name: "Edit user" }).click();
      const again = page.getByRole("dialog");
      await again.getByRole("checkbox", { name: /Active/ }).check();
      await again.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("User saved")).toBeVisible();
      done = true;
      break;
    }
    expect(done).toBe(true);
  });
});
