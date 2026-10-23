// Deterministic demo data generator. Dates are relative to "now" so the demo always looks current.
// Usage: tsx prisma/seed.ts            -> seeds only if the database has no users
//        tsx prisma/seed.ts --force    -> wipes all data and reseeds
import { PrismaClient, Prisma, type Stage, type ForecastCategory } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  ACCOUNTS, ADMIN_NAME, BUSINESS_UNITS, CATEGORY_OEMS, CATEGORY_PROFILE, CONTACT_TEMPLATES, FIRST_NAMES,
  LAST_NAMES, OEMS, PICKLISTS, PRESALES_PEOPLE, PURCHASE_PEOPLE, SALES_HEAD, SALES_PEOPLE, PRODUCT_TEMPLATES, COMPLEMENTS,
  OEM_CODE,
} from "./seed-data";
import { billingPeriods } from "../src/lib/boq";
import { lockForBilling } from "../src/server/domain/billing";
import { STAGE_META, type StageKey } from "../src/lib/constants";
import { defaultForecast } from "../src/lib/rules/evaluate";
import { recomputeAll } from "../src/lib/opportunity-service";
import { fiscalPeriod, quarterRange } from "../src/lib/fiscal";

const db = new PrismaClient();
const DEMO_PASSWORD = "Progression@123";

// ── deterministic PRNG ──
let s = 20261021;
function rnd() {
  s |= 0;
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (a: number, b: number) => Math.floor(rnd() * (b - a + 1)) + a;
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
const chance = (p: number) => rnd() < p;
const NOW = new Date();
const DAY = 86_400_000;
const daysAgo = (d: number, hour = int(9, 18)) => {
  const x = new Date(NOW.getTime() - d * DAY);
  x.setUTCHours(hour - 5, int(0, 59), 0, 0); // working hours IST
  return x;
};
const daysAhead = (d: number) => daysAgo(-d, 12);
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const emailOf = (name: string) => name.toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/\s+/g, ".") + "@progression.com";

type Scenario =
  | "fresh" | "healthy" | "hot" | "stalled" | "overdue" | "slipping" | "pricingOverdue" | "presalesOverdue"
  | "noPresales" | "lowMargin" | "commitOverdue";

// Planned mix for open deals so every dashboard panel has meaningful content.
const OPEN_PLAN: [StageKey, Scenario][] = [
  ["IDENTIFIED", "fresh"], ["IDENTIFIED", "fresh"], ["IDENTIFIED", "fresh"], ["IDENTIFIED", "healthy"],
  ["IDENTIFIED", "healthy"], ["IDENTIFIED", "stalled"], ["IDENTIFIED", "stalled"],
  ["QUALIFIED", "healthy"], ["QUALIFIED", "healthy"], ["QUALIFIED", "healthy"], ["QUALIFIED", "healthy"],
  ["QUALIFIED", "stalled"], ["QUALIFIED", "stalled"], ["QUALIFIED", "overdue"], ["QUALIFIED", "slipping"],
  ["QUALIFIED", "fresh"],
  ["BOQ", "healthy"], ["BOQ", "healthy"], ["BOQ", "healthy"], ["BOQ", "healthy"], ["BOQ", "pricingOverdue"],
  ["BOQ", "pricingOverdue"], ["BOQ", "noPresales"], ["BOQ", "stalled"], ["BOQ", "presalesOverdue"],
  ["PROPOSAL", "hot"], ["PROPOSAL", "hot"], ["PROPOSAL", "hot"], ["PROPOSAL", "hot"], ["PROPOSAL", "healthy"],
  ["PROPOSAL", "healthy"], ["PROPOSAL", "overdue"], ["PROPOSAL", "slipping"], ["PROPOSAL", "lowMargin"],
  ["NEGOTIATION", "hot"], ["NEGOTIATION", "hot"], ["NEGOTIATION", "hot"], ["NEGOTIATION", "commitOverdue"],
  ["NEGOTIATION", "healthy"], ["NEGOTIATION", "stalled"],
  ["HOLD", "stalled"], ["HOLD", "stalled"], ["HOLD", "stalled"],
];
const CLOSED_PLAN: StageKey[] = [
  ...Array<StageKey>(17).fill("WON"), ...Array<StageKey>(7).fill("LOST"), ...Array<StageKey>(3).fill("DROPPED"),
];

const ACTIVITY_SUBJECTS: Record<string, string[]> = {
  CALL: ["Discovery call", "Follow-up call on requirements", "Call with procurement on timelines", "Budget confirmation call", "Call to review proposal"],
  EMAIL: ["Shared solution brief", "Sent revised commercials", "Shared reference case studies", "Sent BOQ for validation", "Followed up on PO status"],
  MEETING: ["Requirement workshop", "Solution walkthrough with IT team", "Commercial negotiation meeting", "Executive briefing with CIO", "Technical clarification meeting"],
  DEMO: ["Product demo", "PoC kickoff", "PoC results review"],
  SITE_VISIT: ["Data centre site survey", "Branch site survey", "Rack and power audit"],
  NOTE: ["Customer evaluating two other bidders", "Budget approved for this financial year", "Decision deferred to next board meeting", "OEM account manager aligned"],
};

async function wipe() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await db.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }
}

async function main() {
  const force = process.argv.includes("--force");
  const existing = await db.user.count();
  if (existing > 0 && !force) {
    console.log(`Seed skipped: database already has ${existing} users (use --force to reset).`);
    return;
  }
  if (force) await wipe();
  console.log("Seeding Progression CRM demo data…");

  // ── Users ──
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const mkUser = (name: string, role: "ADMIN" | "SALES_HEAD" | "SALES" | "PRESALES" | "PURCHASE", title: string, managerId?: string, email?: string) =>
    db.user.create({
      data: {
        name, role, title, managerId, passwordHash: hash, email: email ?? emailOf(name),
        phone: `+91 9${int(100000000, 999999999)}`, region: pick(["North", "West", "South", "East"]),
        lastLoginAt: daysAgo(int(0, 3)),
      },
    });
  const admin = await mkUser(ADMIN_NAME, "ADMIN", "CRM Administrator", undefined, "admin@progression.com");
  const head = await mkUser(SALES_HEAD, "SALES_HEAD", "Vice President - Sales");
  const sales = [];
  for (const n of SALES_PEOPLE) sales.push(await mkUser(n, "SALES", pick(["Account Manager", "Senior Account Manager", "Key Account Manager"]), head.id));
  const presales = [];
  for (const n of PRESALES_PEOPLE) presales.push(await mkUser(n, "PRESALES", pick(["Solution Architect", "Presales Consultant", "Senior Solution Architect"])));
  const purchase = [];
  for (const n of PURCHASE_PEOPLE) purchase.push(await mkUser(n, "PURCHASE", "Purchase Manager"));

  // ── Picklists ──
  const bus: Record<string, { id: string; cats: Record<string, string> }> = {};
  for (const [i, bu] of BUSINESS_UNITS.entries()) {
    const row = await db.businessUnit.create({ data: { name: bu.name, code: bu.code, sortOrder: i } });
    bus[bu.name] = { id: row.id, cats: {} };
    for (const [j, c] of bu.categories.entries()) {
      const cat = await db.category.create({ data: { name: c, businessUnitId: row.id, sortOrder: j } });
      bus[bu.name]!.cats[c] = cat.id;
    }
  }
  const oems: Record<string, string> = {};
  for (const [i, name] of OEMS.entries()) oems[name] = (await db.oem.create({ data: { name, sortOrder: i } })).id;
  for (const [type, values] of Object.entries(PICKLISTS)) {
    await db.picklistValue.createMany({ data: values.map((value, i) => ({ type, value, sortOrder: i })) });
  }

  // ── Product catalogue ──
  const CAT_CODE: Record<string, string> = {
    "IT Infrastructure|Server": "SRV", "IT Infrastructure|Storage": "STO", "IT Infrastructure|Laptop": "NBK",
    "IT Infrastructure|Desktop": "DSK", "IT Infrastructure|Workstation": "WKS", "IT Infrastructure|Licence": "VLC",
    "IT Infrastructure|Networking": "NET", "IT Infrastructure|Others": "OTH", "Cloud|Hosting": "HST",
    "Cloud|Managed Hosting": "MHS", "Cloud|DRaaS": "DRS", "Cloud|Colo": "COL", "Cloud|Public Cloud": "PUB",
    "Cloud|Licence": "CLC", "Services|FMS": "FMS", "Services|NOC": "NOC", "Services|AMC": "AMC",
    "Services|Professional Services": "PSV", "Services|Backup as a Service": "BKP", "Cybersecurity|SOC": "SOC",
    "Cybersecurity|Licence": "SLC", "Cybersecurity|Compliance": "CMP",
  };
  type SeedProduct = { id: string; code: string; oem: string; catKey: string; tpl: (typeof PRODUCT_TEMPLATES)[string][number]; price: number };
  const productsByCat: Record<string, SeedProduct[]> = {};
  for (const [catKey, tpls] of Object.entries(PRODUCT_TEMPLATES)) {
    const [buName, catName] = catKey.split("|") as [string, string];
    for (const oem of CATEGORY_OEMS[catKey] ?? []) {
      for (const [i, tpl] of tpls.entries()) {
        // Progression-only services are not resold for other OEMs' service categories
        const isService = tpl.type === "SERVICE" || tpl.type === "SUPPORT_AMC";
        if (isService && oem !== "Progression" && !["Services|AMC", "Cloud|DRaaS", "Cloud|Public Cloud"].includes(catKey) && catKey !== "IT Infrastructure|Server") continue;
        const factor = 0.9 + ((oem.length * 7 + i * 3) % 25) / 100;
        const price = Math.round((tpl.price * factor) / 10) * 10;
        const code = `${OEM_CODE[oem]}-${CAT_CODE[catKey]}-${String(i + 1).padStart(2, "0")}`;
        const row = await db.product.create({
          data: {
            code, name: `${oem} ${tpl.name}`, businessUnitId: bus[buName]!.id, categoryId: bus[buName]!.cats[catName]!,
            oemId: oems[oem]!, productType: tpl.type, unit: tpl.unit, billingFrequency: tpl.freq, defaultTermMonths: tpl.term ?? null,
            listPrice: price, standardCost: Math.round(price * tpl.cost), hsnSac: tpl.hsn, gstRatePct: 18,
            description: `${tpl.name}. ${tpl.freq === "ONE_TIME" ? "One-time" : tpl.freq.toLowerCase() + " billing"}.`,
            createdById: admin.id,
          },
        });
        (productsByCat[catKey] ??= []).push({ id: row.id, code, oem, catKey, tpl, price });
      }
    }
  }
  const productCount = Object.values(productsByCat).reduce((a, x) => a + x.length, 0);

  // ── Accounts & contacts ──
  const accounts: { id: string; short: string; ownerId: string; contacts: { id: string; role: string }[]; govt: boolean; prospect: boolean; industry: string }[] = [];
  const usedNames = new Set<string>();
  for (const [i, a] of ACCOUNTS.entries()) {
    const owner = sales[i % sales.length]!;
    const panCore = `AA${String.fromCharCode(65 + i)}C${String.fromCharCode(75 + (i % 10))}${int(1000, 9999)}${String.fromCharCode(65 + int(0, 25))}`;
    const created = daysAgo(int(420, 900));
    const acc = await db.account.create({
      data: {
        code: `ACC-${String(i + 1).padStart(4, "0")}`,
        name: a.name, industry: a.industry, segment: a.segment as never,
        accountType: a.prospect ? "NEW_LOGO" : "EXISTING", status: a.prospect ? "PROSPECT" : "ACTIVE",
        website: `https://www.${a.site}`, phone: `+91 ${int(20, 80)} ${int(2000, 9999)} ${int(1000, 9999)}`,
        gstin: `${a.stateCode}${panCore}1Z${int(1, 9)}`, pan: panCore,
        addressLine: a.address, city: a.city, state: a.state, pincode: a.pincode,
        annualRevenueCr: a.revenueCr, employees: a.employees, ownerId: owner.id,
        description: `${a.industry} customer headquartered in ${a.city}.`,
        createdById: owner.id, createdAt: created, updatedAt: created,
      },
    });
    await db.auditLog.create({ data: { entityType: "Account", entityId: acc.id, action: "CREATE", changedById: owner.id, changedAt: created } });
    const nContacts = int(3, 4);
    const templates = [...CONTACT_TEMPLATES].sort(() => rnd() - 0.5).slice(0, nContacts);
    if (!templates.some((t) => t.role === "DECISION_MAKER")) templates[0] = CONTACT_TEMPLATES[0];
    const contacts = [];
    for (const [k, t] of templates.entries()) {
      let fn: string, ln: string;
      do { fn = pick(FIRST_NAMES); ln = pick(LAST_NAMES); } while (usedNames.has(fn + ln));
      usedNames.add(fn + ln);
      const c = await db.contact.create({
        data: {
          accountId: acc.id, firstName: fn, lastName: ln, title: t.title, department: t.dept, role: t.role as never,
          email: `${fn}.${ln}@${a.site}`.toLowerCase(), phone: `+91 ${int(20, 80)} ${int(2000, 9999)} ${int(1000, 9999)}`,
          mobile: `+91 9${int(100000000, 999999999)}`, isPrimary: k === 0, createdById: owner.id, createdAt: created,
        },
      });
      contacts.push({ id: c.id, role: t.role });
    }
    accounts.push({ id: acc.id, short: a.short, ownerId: owner.id, contacts, govt: a.segment === "GOVT_PSU", prospect: a.prospect, industry: a.industry });
  }

  // ── Opportunities ──
  const catKeys = Object.keys(CATEGORY_PROFILE);
  const plan: { stage: StageKey; scenario: Scenario | "closed" }[] = [
    ...OPEN_PLAN.map(([stage, scenario]) => ({ stage, scenario })),
    ...CLOSED_PLAN.map((stage) => ({ stage, scenario: "closed" as const })),
  ];
  // shuffle deterministically so accounts and reps get a mix
  plan.sort(() => rnd() - 0.5);

  const fyCounters: Record<string, number> = {};
  const reviewAt = daysAgo(7, 10);
  let repCursor = 0;
  const wonByAccount = new Set<string>();
  const usedNamesByAccount = new Set<string>();
  let recentNew = 0, recentWon = 0, recentLost = 0;

  for (const [idx, p] of plan.entries()) {
    // prospects only get early-stage / lost deals
    let account = accounts[idx % accounts.length]!;
    if (account.prospect && !["IDENTIFIED", "QUALIFIED", "BOQ", "PROPOSAL", "LOST"].includes(p.stage)) {
      account = accounts[(idx + 3) % 8]!;
    }
    const isClosed = p.scenario === "closed";
    let catKey = pick(catKeys);
    // Govt accounts favour infra & SOC; avoid tiny "Others" deals for late stage
    if (account.govt) catKey = pick(["IT Infrastructure|Server", "IT Infrastructure|Networking", "Cybersecurity|SOC", "Services|FMS", "Cloud|Colo"]);
    const [buName, catName] = catKey.split("|") as [string, string];
    const prof = CATEGORY_PROFILE[catKey]!;
    const oemName = pick(CATEGORY_OEMS[catKey]!);
    let baseName = pick(prof.names);
    let nameKey = `${account.short}|${baseName}`;
    if (usedNamesByAccount.has(nameKey)) { baseName = `${baseName} Phase 2`; nameKey = `${account.short}|${baseName}`; }
    usedNamesByAccount.add(nameKey);

    // Owner: account owner 55%, otherwise round-robin so every rep carries deals
    const owner = chance(0.55) ? sales.find((u) => u.id === account.ownerId)! : sales[repCursor++ % sales.length]!;

    let amount = roundTo(prof.min + rnd() * (prof.max - prof.min), 10000);
    if (p.scenario === "hot" || p.scenario === "commitOverdue") amount = roundTo(Math.max(amount, prof.min * 2), 10000);
    const arr = prof.arr;

    // Timeline
    let createdDaysAgo: number;
    let closedAt: Date | null = null;
    if (isClosed) {
      // spread closures over the last 13 months, a few in the last week
      let closedDaysAgo = int(8, 390);
      if (p.stage === "WON" && recentWon < 2) { closedDaysAgo = int(1, 6); recentWon++; }
      else if (p.stage === "LOST" && recentLost < 1) { closedDaysAgo = int(1, 6); recentLost++; }
      closedAt = daysAgo(closedDaysAgo);
      createdDaysAgo = closedDaysAgo + int(35, 160);
    } else if (p.scenario === "fresh" && recentNew < 4) {
      createdDaysAgo = int(1, 6); recentNew++;
    } else if (p.scenario === "fresh") {
      createdDaysAgo = int(8, 14);
    } else if (p.scenario === "stalled") {
      createdDaysAgo = int(90, 220);
    } else {
      createdDaysAgo = int(25, 160) + STAGE_META[p.stage].order * 6;
    }
    const createdAt = daysAgo(createdDaysAgo);
    const closedDaysAgoN = closedAt ? Math.floor((NOW.getTime() - closedAt.getTime()) / DAY) : 0;
    const term = arr ? (p.stage === "WON" && closedDaysAgoN >= 280 && closedDaysAgoN <= 360 ? 12 : pick([12, 24, 36, 36, 60])) : null;
    const arrAmount = arr && term ? roundTo(amount / (term / 12), 1000) : null;

    // Stage entry
    let stageAge: number;
    switch (p.scenario) {
      case "stalled": stageAge = Math.min(createdDaysAgo - 5, int(50, 95)); break;
      case "hot": stageAge = int(1, 6); break;
      case "fresh": stageAge = createdDaysAgo; break;
      case "closed": stageAge = Math.floor((NOW.getTime() - closedAt!.getTime()) / DAY); break;
      default: stageAge = Math.min(createdDaysAgo - 2, int(4, 18));
    }
    stageAge = Math.max(0, Math.min(stageAge, createdDaysAgo));
    const stageEnteredAt = isClosed ? closedAt! : daysAgo(stageAge);

    // Close dates
    let expectedClose: Date;
    let slips = 0;
    if (isClosed) {
      expectedClose = closedAt!;
      slips = chance(0.3) ? int(1, 2) : 0;
    } else if (p.scenario === "overdue" || p.scenario === "commitOverdue") {
      expectedClose = daysAgo(int(3, 12), 12);
      slips = int(1, 2);
    } else if (p.scenario === "slipping") {
      expectedClose = daysAhead(int(20, 60));
      slips = int(3, 4);
    } else if (p.scenario === "hot") {
      expectedClose = daysAhead(int(7, 45));
    } else if (p.scenario === "stalled") {
      expectedClose = chance(0.5) ? daysAgo(int(15, 60), 12) : daysAhead(int(10, 60));
      slips = int(1, 3);
    } else {
      expectedClose = daysAhead(int(20, 150) - STAGE_META[p.stage].order * 5);
    }
    const originalClose = new Date(expectedClose.getTime() - slips * int(20, 35) * DAY);

    let forecast: ForecastCategory = defaultForecast(p.stage) as ForecastCategory;
    if (p.scenario === "hot" && p.stage === "PROPOSAL" && chance(0.5)) forecast = "COMMIT";
    if (p.scenario === "commitOverdue") forecast = "COMMIT";
    if (p.stage === "BOQ" && chance(0.3)) forecast = "UPSIDE";
    if (p.stage === "QUALIFIED" && p.scenario === "overdue") forecast = "COMMIT"; // commit sanity flag example

    const fy = fiscalPeriod(createdAt).fiscalYear;
    const fyKey = `OPP-FY${String(fy).slice(-2)}`;
    fyCounters[fyKey] = (fyCounters[fyKey] ?? 0) + 1;
    const code = `${fyKey}-${String(fyCounters[fyKey]).padStart(4, "0")}`;

    const order = STAGE_META[p.stage].order;
    const reachedBoq = order >= 3 && p.stage !== "HOLD" ? true : p.stage === "HOLD" ? chance(0.5) : false;
    const reachedBoqClosed = isClosed && (p.stage === "WON" || chance(0.6));
    const hasBoq = (reachedBoq || reachedBoqClosed) && p.scenario !== "noPresales";
    const presalesUser = (hasBoq || (p.stage === "QUALIFIED" && chance(0.35))) && p.scenario !== "noPresales" ? pick(presales) : null;
    const purchaseUser = hasBoq ? pick(purchase) : null;

    const primary = account.contacts[0]!;
    const singleThreaded = amount >= 5e6 && chance(0.25);
    const oppContacts = singleThreaded ? [primary] : [primary, ...account.contacts.slice(1).filter(() => chance(0.6))];

    const procurement = account.govt ? "TENDER" : account.industry === "BFSI" && chance(0.5) ? "RFP" : chance(0.15) ? "RFQ" : "DIRECT";
    const submissionDue = procurement === "TENDER" || procurement === "RFP"
      ? order < 4 && !isClosed ? daysAhead(int(3, 25)) : daysAgo(int(10, 40))
      : null;
    const oemNeedsReg = !["Progression", "Neon Cloud"].includes(oemName) && (buName === "IT Infrastructure" || buName === "Cybersecurity");
    let dealRegStatus: "NOT_REQUIRED" | "PENDING" | "APPROVED" = "NOT_REQUIRED";
    let dealRegExpiry: Date | null = null;
    if (oemNeedsReg && order >= 2) {
      dealRegStatus = order >= 3 && chance(0.15) && !isClosed ? "PENDING" : "APPROVED";
      if (dealRegStatus === "APPROVED") dealRegExpiry = isClosed ? daysAgo(int(1, 90)) : daysAhead(chance(0.2) ? int(3, 12) : int(30, 120));
    }

    const lossReason = p.stage === "LOST" ? pick(PICKLISTS.LOSS_REASON!.slice(0, 7)) : p.stage === "DROPPED" ? pick(["Project deferred", "Budget cut / frozen", "Disqualified"]) : null;
    const nextStepOptions = {
      IDENTIFIED: ["Schedule discovery workshop", "Identify decision maker", "Qualify budget and timeline"],
      QUALIFIED: ["Pull in presales for solution design", "Site survey", "Confirm technical requirements"],
      BOQ: ["Finalise BOQ with customer IT", "Get OEM pricing", "Validate sizing with OEM"],
      PROPOSAL: ["Proposal walkthrough with CIO", "Respond to technical queries", "Commercial clarification call"],
      NEGOTIATION: ["Final commercial negotiation", "Await PO from procurement", "Legal review of MSA"],
      HOLD: ["Revisit after budget approval", "Check status after board meeting"],
    } as Record<string, string[]>;
    const hasNextStep = !isClosed && !(p.scenario === "stalled" && chance(0.6));
    const nextStepDate = hasNextStep ? (p.scenario === "stalled" || p.scenario === "overdue" ? daysAgo(int(5, 30), 12) : daysAhead(int(1, 14))) : null;

    let marginTarget = buName === "IT Infrastructure" ? 0.09 + rnd() * 0.07 : buName === "Cloud" ? 0.18 + rnd() * 0.12 : 0.22 + rnd() * 0.15;
    if (p.scenario === "lowMargin") marginTarget = 0.045 + rnd() * 0.02;

    const opp = await db.opportunity.create({
      data: {
        code, name: `${account.short} - ${baseName}`, accountId: account.id, primaryContactId: primary.id,
        businessUnitId: bus[buName]!.id, categoryId: bus[buName]!.cats[catName]!, oemId: oems[oemName],
        accountType: account.prospect || !wonByAccount.has(account.id) && createdDaysAgo > 300 ? "NEW_LOGO" : "EXISTING",
        revenueModel: arr ? "ARR" : "ONE_TIME",
        dealType: arr && chance(0.3) ? "RENEWAL" : wonByAccount.has(account.id) ? pick(["UPSELL", "CROSS_SELL"]) : "NEW_BUSINESS",
        procurementMode: procurement,
        amount, arrAmount, contractTermMonths: term,
        contractStartDate: p.stage === "WON" && arr ? closedAt : null,
        contractEndDate: p.stage === "WON" && arr && term ? new Date(closedAt!.getTime() + term * 30.4 * DAY) : null,
        expectedMarginPct: Math.round(marginTarget * 10000) / 100,
        stage: p.stage as Stage,
        probability: STAGE_META[p.stage].probability,
        forecastCategory: forecast,
        expectedCloseDate: expectedClose, originalCloseDate: originalClose, closeDateSlipCount: slips,
        stageEnteredAt, closedAt,
        salesOwnerId: owner.id, presalesOwnerId: presalesUser?.id ?? null, purchaseOwnerId: purchaseUser?.id ?? null,
        leadSource: pick(PICKLISTS.LEAD_SOURCE!), competitors: chance(0.6) ? pick(PICKLISTS.COMPETITOR!) : null,
        nextStep: hasNextStep ? pick(nextStepOptions[p.stage] ?? ["Follow up"]) : null, nextStepDate,
        submissionDueDate: submissionDue, dealRegStatus, dealRegExpiry,
        dealRegNumber: dealRegStatus === "APPROVED" ? `DR-${oemName.slice(0, 3).toUpperCase()}-${int(100000, 999999)}` : null,
        lossReason, lossNotes: lossReason ? "Captured during loss review with sales head." : null,
        poNumber: p.stage === "WON" ? `PO/${account.short.replace(/\s/g, "").slice(0, 4).toUpperCase()}/${int(1000, 9999)}` : null,
        poDate: p.stage === "WON" ? closedAt : null,
        description: `${baseName} for ${account.short}. ${oemName} based solution under ${buName} / ${catName}.`,
        createdById: owner.id, updatedById: owner.id, createdAt, updatedAt: stageEnteredAt,
      },
    });
    if (p.stage === "WON") wonByAccount.add(account.id);

    await db.opportunityContact.createMany({ data: oppContacts.map((c) => ({ opportunityId: opp.id, contactId: c.id, role: c.role as never })) });
    await db.auditLog.create({ data: { entityType: "Opportunity", entityId: opp.id, action: "CREATE", newValue: opp.name, changedById: owner.id, changedAt: createdAt } });

    // Stage history: walk the path to the current stage
    const path: StageKey[] = ["IDENTIFIED"];
    const linear: StageKey[] = ["QUALIFIED", "BOQ", "PROPOSAL", "NEGOTIATION"];
    const target = isClosed ? (p.stage === "WON" ? "NEGOTIATION" : pick(linear.slice(0, int(1, 4)))) : p.stage === "HOLD" ? pick(linear.slice(0, 3)) : p.stage;
    for (const st of linear) { if (STAGE_META[st].order <= STAGE_META[target].order) path.push(st); }
    if (isClosed || p.stage === "HOLD") path.push(p.stage);
    const t0 = createdAt.getTime();
    const tEnd = stageEnteredAt.getTime();
    let prevAt = createdAt;
    for (const [k, st] of path.entries()) {
      const at = k === 0 ? createdAt : k === path.length - 1 ? stageEnteredAt : new Date(t0 + ((tEnd - t0) * k) / (path.length - 1));
      await db.stageHistory.create({
        data: {
          opportunityId: opp.id, fromStage: k === 0 ? null : (path[k - 1] as Stage), toStage: st as Stage, amount,
          changedById: owner.id, changedAt: at, daysInPrevStage: k === 0 ? null : Math.round((at.getTime() - prevAt.getTime()) / DAY),
        },
      });
      if (k > 0) {
        await db.auditLog.create({ data: { entityType: "Opportunity", entityId: opp.id, action: "UPDATE", field: "stage", oldValue: path[k - 1], newValue: st, changedById: owner.id, changedAt: at } });
      }
      prevAt = at;
    }

    // Field changes since the last pipeline review (7 days ago) for the "changes since review" view
    if (!isClosed && createdAt < reviewAt) {
      if (chance(0.22)) {
        const old = roundTo(amount * pick([0.8, 0.85, 1.15, 1.25]), 10000);
        await db.auditLog.create({ data: { entityType: "Opportunity", entityId: opp.id, action: "UPDATE", field: "amount", oldValue: String(old), newValue: String(amount), changedById: owner.id, changedAt: daysAgo(int(1, 6)) } });
      }
      if (slips > 0 && chance(0.5)) {
        const old = new Date(expectedClose.getTime() - int(14, 30) * DAY);
        await db.auditLog.create({ data: { entityType: "Opportunity", entityId: opp.id, action: "UPDATE", field: "expectedCloseDate", oldValue: old.toISOString(), newValue: expectedClose.toISOString(), changedById: owner.id, changedAt: daysAgo(int(1, 6)) } });
      }
      if (forecast === "COMMIT" && chance(0.5)) {
        await db.auditLog.create({ data: { entityType: "Opportunity", entityId: opp.id, action: "UPDATE", field: "forecastCategory", oldValue: "UPSIDE", newValue: "COMMIT", changedById: owner.id, changedAt: daysAgo(int(1, 6)) } });
      }
    }

    // BOQ lines, presales & pricing workflow
    let lineCount = 0;
    if (hasBoq) {
      const priced = isClosed || order >= 4 || (p.stage === "BOQ" && p.scenario === "healthy" && chance(0.5)) || p.stage === "HOLD";
      const pricingOpen = p.stage === "BOQ" && !priced && p.scenario !== "presalesOverdue";
      const presalesOpen = p.scenario === "presalesOverdue" || (p.stage === "BOQ" && !priced && !pricingOpen);
      // Line plan: products from the deal's own category and OEM, plus complementary products from other
      // OEMs/BUs for ~45% of deals (e.g. servers + virtualisation licences + implementation services).
      const own = (productsByCat[catKey] ?? []).filter((x) => x.oem === oemName);
      const primary = (own.length ? own : productsByCat[catKey] ?? []).slice(0, int(1, 3));
      const extras: SeedProduct[] = [];
      if (chance(0.45) && COMPLEMENTS[catKey]) {
        for (const ck of COMPLEMENTS[catKey]!.slice(0, int(1, 2))) {
          const choices = productsByCat[ck];
          if (choices?.length) extras.push(pick(choices));
        }
      }
      const plan = [
        ...primary.map((pr, i) => ({ pr, w: (0.72 / primary.length) * (i === 0 ? 1.4 : 0.8) })),
        ...extras.map((pr) => ({ pr, w: 0.28 / extras.length })),
      ];
      const wSum = plan.reduce((a, x) => a + x.w, 0);
      let total = 0;
      let cost = 0;
      for (const [k, { pr, w }] of plan.entries()) {
        const freq = pr.tpl.freq;
        const lineTerm = freq === "ONE_TIME" ? null : term ?? pr.tpl.term ?? 12;
        const periods = billingPeriods({ billingFrequency: freq, termMonths: lineTerm });
        const ext = (amount * w) / wSum;
        const unit = pr.tpl.unit;
        let qty = ["Lot", "Month", "Pool", "Year", "Drill"].includes(unit) ? 1 : Math.max(1, Math.round(ext / (pr.price * periods)));
        if (unit === "Days") qty = Math.min(qty, 220);
        const unitPrice = Math.max(1, Math.round(ext / (qty * periods)));
        const unitCost = Math.round(unitPrice * (1 - marginTarget * (0.85 + rnd() * 0.3)));
        total += unitPrice * qty * periods;
        cost += unitCost * qty * periods;
        const cat = pr.catKey.split("|") as [string, string];
        await db.opportunityLineItem.create({
          data: {
            opportunityId: opp.id, lineNo: k + 1, productId: pr.id, businessUnitId: bus[cat[0]]!.id, categoryId: bus[cat[0]]!.cats[cat[1]]!,
            oemId: oems[pr.oem]!, partNumber: pr.code, description: `${pr.oem} ${pr.tpl.name}`, quantity: qty, unit,
            billingFrequency: freq, termMonths: lineTerm, hsnSac: pr.tpl.hsn, gstRatePct: 18,
            unitCost: priced ? unitCost : null, unitPrice: priced ? unitPrice : null,
            distributor: priced && pr.oem !== "Progression" ? pick(PICKLISTS.DISTRIBUTOR!) : null,
            oemQuoteRef: priced && pr.oem !== "Progression" ? `Q-${int(100000, 999999)}` : null,
            leadTimeDays: priced ? pick([7, 14, 21, 30, 45]) : null, pricingStatus: priced ? "QUOTED" : "PENDING",
            createdById: presalesUser?.id ?? owner.id, createdAt: new Date(createdAt.getTime() + 10 * DAY),
          },
        });
        lineCount++;
      }
      if (priced && total > 0) {
        amount = total;
        await db.opportunity.update({
          where: { id: opp.id },
          data: { amount: total, expectedMarginPct: Math.round(((total - cost) / total) * 10000) / 100, arrAmount: arr && term ? Math.round(total / (term / 12)) : null },
        });
      }
      if (presalesUser) {
        // Open requests get recent, internally consistent dates; completed ones sit early in the deal's life.
        const openPricingAt = pricingOpen ? (p.scenario === "pricingOverdue" ? daysAgo(int(10, 13)) : daysAgo(int(1, 3))) : null;
        const reqAt0 = presalesOpen
          ? daysAgo(p.scenario === "presalesOverdue" ? int(12, 15) : int(2, 5))
          : openPricingAt
            ? new Date(openPricingAt.getTime() - int(4, 7) * DAY)
            : new Date(Math.min(createdAt.getTime() + int(5, 20) * DAY, NOW.getTime() - 10 * DAY));
        const reqAt = new Date(Math.max(reqAt0.getTime(), createdAt.getTime() + DAY));
        const presalesDue = new Date(reqAt.getTime() + 7 * DAY);
        const pr = await db.presalesRequest.create({
          data: {
            opportunityId: opp.id, requestedById: owner.id, assignedToId: presalesUser.id,
            status: presalesOpen ? (chance(0.5) ? "IN_PROGRESS" : "REQUESTED") : "BOQ_SUBMITTED",
            priority: amount > 1e7 ? "HIGH" : "NORMAL",
            scope: `Design ${catName.toLowerCase()} solution and prepare BOQ. Customer requirement: ${baseName.toLowerCase()}.`,
            dueDate: presalesDue, createdAt: reqAt, startedAt: new Date(reqAt.getTime() + DAY),
            submittedAt: presalesOpen ? null : openPricingAt ?? new Date(reqAt.getTime() + int(3, 7) * DAY),
            solutionSummary: presalesOpen ? null : `${oemName} based design sized for current load plus 30% headroom over 3 years.`,
          },
        });
        if (!presalesOpen) {
          const priceReqAt = pr.submittedAt ?? reqAt;
          const pricingDue = new Date(priceReqAt.getTime() + 5 * DAY);
          await db.pricingRequest.create({
            data: {
              opportunityId: opp.id, presalesRequestId: pr.id, requestedById: presalesUser.id, assignedToId: purchaseUser!.id,
              status: pricingOpen ? (chance(0.5) ? "IN_PROGRESS" : "REQUESTED") : "QUOTED",
              notes: "Please get best landed price with 3-year support. Check stock availability.",
              dueDate: pricingDue, createdAt: priceReqAt,
              quotedAt: pricingOpen ? null : new Date(priceReqAt.getTime() + int(2, 5) * DAY),
              quoteValidTill: pricingOpen ? null : new Date(priceReqAt.getTime() + 35 * DAY),
              responseNotes: pricingOpen ? null : "Pricing received from distributor. Valid for 30 days.",
            },
          });
          if (pricingOpen) {
            await db.notification.create({ data: { userId: purchaseUser!.id, type: "PRICING_REQUEST", title: `Pricing requested: ${opp.name}`, body: `${presalesUser.name} submitted the BOQ and needs pricing.`, link: `/opportunities/${opp.id}?tab=boq`, createdAt: priceReqAt } });
          }
        } else {
          await db.notification.create({ data: { userId: presalesUser.id, type: "PRESALES_REQUEST", title: `BOQ requested: ${opp.name}`, body: `${owner.name} pulled you in to prepare the BOQ.`, link: `/opportunities/${opp.id}?tab=boq`, createdAt: reqAt } });
        }
      }
      // Quotes for proposal stage and beyond
      if (priced && (order >= 4 && order !== 6 || isClosed && p.stage === "WON")) {
        const versions = p.stage === "NEGOTIATION" || p.stage === "WON" ? 2 : 1;
        for (let v = 1; v <= versions; v++) {
          const price = v < versions ? amount * 1.06 : amount;
          const qFy = fiscalPeriod(createdAt).fiscalYear;
          const qKey = `QT-FY${String(qFy).slice(-2)}`;
          fyCounters[qKey] = (fyCounters[qKey] ?? 0) + 1;
          await db.quote.create({
            data: {
              code: `${qKey}-${String(fyCounters[qKey]).padStart(4, "0")}`, opportunityId: opp.id, version: v,
              status: v < versions ? "SUPERSEDED" : p.stage === "WON" ? "ACCEPTED" : p.stage === "LOST" ? "REJECTED" : "SUBMITTED",
              totalPrice: Math.round(price), totalCost: Math.round(amount * (1 - marginTarget)),
              marginPct: Math.round((1 - (amount * (1 - marginTarget)) / price) * 10000) / 100,
              validTill: new Date(stageEnteredAt.getTime() + 30 * DAY), snapshot: [],
              terms: "Prices in INR exclusive of GST. Payment 30 days from invoice. Delivery 3-4 weeks from PO.",
              createdById: owner.id, createdAt: new Date(stageEnteredAt.getTime() - (versions - v + 1) * 4 * DAY),
              submittedAt: new Date(stageEnteredAt.getTime() - (versions - v + 1) * 4 * DAY),
            },
          });
        }
      }
    }
    void lineCount;
    if (p.stage === "WON" && lineCount > 0) {
      await lockForBilling(db as unknown as Parameters<typeof lockForBilling>[0], opp.id, {
        poDate: closedAt, contractStart: arr ? closedAt : null, now: closedAt!, userId: owner.id,
      });
    }

    // Activities
    const nActs = isClosed ? int(4, 9) : p.scenario === "fresh" ? int(1, 2) : int(3, 10);
    let lastAct = createdAt;
    const activityWindowEnd =
      p.scenario === "stalled" ? daysAgo(int(24, 55)) :
      p.scenario === "overdue" || p.scenario === "commitOverdue" ? daysAgo(int(8, 18)) :
      isClosed ? closedAt! :
      p.scenario === "hot" ? daysAgo(int(0, 3)) :
      daysAgo(int(1, 12));
    const span = Math.max(1, activityWindowEnd.getTime() - createdAt.getTime());
    for (let k = 0; k < nActs; k++) {
      const at = k === nActs - 1 ? activityWindowEnd : new Date(createdAt.getTime() + span * ((k + rnd() * 0.8) / nActs));
      const type = pick(["CALL", "CALL", "EMAIL", "MEETING", "MEETING", "DEMO", "SITE_VISIT", "NOTE"] as const);
      const who = presalesUser && (type === "DEMO" || type === "SITE_VISIT") ? presalesUser : owner;
      const contact = pick(oppContacts);
      await db.activity.create({
        data: {
          type, subject: pick(ACTIVITY_SUBJECTS[type]!), occurredAt: at, completedAt: at, ownerId: who.id, opportunityId: opp.id,
          accountId: account.id, contactId: contact.id,
          body: type === "NOTE" ? null : "Discussed scope, timelines and decision process. Next steps agreed.",
          createdAt: at,
        },
      });
      if (at > lastAct) lastAct = at;
    }
    // open follow-up task
    if (!isClosed && hasNextStep) {
      await db.activity.create({
        data: {
          type: "TASK", subject: opp.nextStep ?? "Follow up", dueAt: nextStepDate, ownerId: owner.id,
          opportunityId: opp.id, accountId: account.id, occurredAt: daysAgo(int(1, 5)),
        },
      });
    }
    await db.opportunity.update({ where: { id: opp.id }, data: { lastActivityAt: lastAct } });
  }

  // ── Account type follows actual won business ──
  for (const a of accounts) {
    if (wonByAccount.has(a.id)) await db.account.update({ where: { id: a.id }, data: { accountType: "EXISTING", status: "ACTIVE" } });
    else await db.account.update({ where: { id: a.id }, data: { accountType: "NEW_LOGO", status: "PROSPECT" } });
  }

  // ── Leads ──
  const leadRows = [
    ["Harsh", "Vardhan", "Northstar Cement Ltd", "Head IT", "Inbound website", "IT Infrastructure", "Server refresh for 3 plants", 1.8e7, "NEW"],
    ["Ishita", "Ghosh", "BlueRiver Insurance Ltd", "CISO", "Event / Webinar", "Cybersecurity", "Managed SOC evaluation", 2.4e7, "CONTACTED"],
    ["Nikhil", "Arora", "GreenLeaf Agro Pvt Ltd", "IT Manager", "Outbound prospecting", "Cloud", "Move ERP to managed cloud", 9e6, "QUALIFIED"],
    ["Pallavi", "Desai", "Orbit Auto Components Ltd", "CIO", "OEM referral", "IT Infrastructure", "Engineering workstations", 6e6, "CONTACTED"],
    ["Sandeep", "Rawat", "Metro Cooperative Bank", "GM - IT", "Tender portal", "Services", "FMS for 120 branches", 3.2e7, "NEW"],
    ["Ayesha", "Siddiqui", "Lotus Hotels & Resorts", "Director - Technology", "Referral", "Cloud", "DR for PMS application", 5e6, "QUALIFIED"],
    ["Rahul", "Bose", "Eastern Jute Mills", "IT Head", "Distributor", "IT Infrastructure", "Desktop refresh", 2.5e6, "UNQUALIFIED"],
    ["Tanvi", "Mehta", "Quantum Fintech Pvt Ltd", "CTO", "Inbound website", "Cybersecurity", "SASE for remote workforce", 1.1e7, "NEW"],
    ["Mohan", "Das", "Coastal Ports Trust", "Chief Engineer IT", "Tender portal", "Cloud", "Tier-III colocation", 4e7, "CONTACTED"],
    ["Rina", "Kapoor", "Sunrise Diagnostics", "IT Manager", "Partner", "Services", "Backup as a service", 3.5e6, "NEW"],
    ["Alok", "Pandey", "Vertex Realty Group", "VP IT", "Event / Webinar", "IT Infrastructure", "Campus network refresh", 8e6, "QUALIFIED"],
    ["Snehal", "Patil", "Kiran Textiles Ltd", "IT Head", "Outbound prospecting", "Services", "Annual AMC consolidation", 1.8e6, "UNQUALIFIED"],
  ] as const;
  for (const [i, l] of leadRows.entries()) {
    const owner = sales[(i * 5) % sales.length]!;
    const created = daysAgo(int(1, 45));
    await db.lead.create({
      data: {
        code: `LEAD-${String(i + 1).padStart(4, "0")}`, firstName: l[0], lastName: l[1], company: l[2], title: l[3], source: l[4],
        businessUnitId: bus[l[5]]!.id, requirement: l[6], estimatedValue: l[7], status: l[8] as never, ownerId: owner.id,
        email: `${l[0]}.${l[1]}@${l[2].split(" ")[0]!.toLowerCase()}.example`.toLowerCase(), phone: `+91 9${int(100000000, 999999999)}`,
        city: pick(["Mumbai", "Delhi", "Bengaluru", "Chennai", "Kolkata", "Pune", "Hyderabad"]),
        disqualifyReason: l[8] === "UNQUALIFIED" ? "No budget this financial year" : null,
        createdById: owner.id, createdAt: created, updatedAt: created,
      },
    });
  }

  // ── Targets: every rep, previous and current fiscal year ──
  const cur = fiscalPeriod(NOW);
  for (const u of sales) {
    const base = roundTo(4e6 + rnd() * 5e6, 500000);
    for (const fy of [cur.fiscalYear - 1, cur.fiscalYear]) {
      for (const q of [1, 2, 3, 4]) {
        await db.salesTarget.create({ data: { userId: u.id, fiscalYear: fy, quarter: q, targetAmount: roundTo(base * (q === 4 ? 1.3 : q === 3 ? 1.1 : 1), 100000) } });
      }
    }
  }
  void quarterRange;

  // ── Pipeline reviews: a baseline 7 days ago for managers and reps ──
  for (const u of [head, admin, ...sales]) {
    await db.pipelineReview.create({ data: { reviewedById: u.id, reviewedAt: reviewAt, notes: "Weekly pipeline review" } });
    await db.pipelineReview.create({ data: { reviewedById: u.id, reviewedAt: daysAgo(14, 10), notes: "Weekly pipeline review" } });
  }

  // ── Sequences ──
  for (const [key, value] of Object.entries(fyCounters)) await db.sequence.upsert({ where: { key }, create: { key, value }, update: { value } });
  await db.sequence.create({ data: { key: "ACC", value: ACCOUNTS.length } });
  await db.sequence.create({ data: { key: "LEAD", value: leadRows.length } });

  // ── Welcome notifications ──
  for (const u of [head, ...sales.slice(0, 3)]) {
    await db.notification.create({ data: { userId: u.id, type: "SYSTEM", title: "Weekly pipeline review is due", body: "Review changes since your last pipeline review.", link: "/reviews" } });
  }

  const n = await recomputeAll(db as unknown as Parameters<typeof recomputeAll>[0], NOW);

  // Snapshot on last week's review, reconstructed from history: deals as they stood at review time, so
  // "changes since review" can compare pipeline value and health.
  const all = await db.opportunity.findMany({
    where: { createdAt: { lt: reviewAt } },
    select: { id: true, healthLabel: true, amount: true, stage: true, closedAt: true },
  });
  const later = await db.auditLog.findMany({
    where: { entityType: "Opportunity", changedAt: { gt: reviewAt }, field: { in: ["amount", "stage"] } },
    orderBy: { changedAt: "asc" },
  });
  const firstOld = new Map<string, string>();
  for (const l of later) if (!firstOld.has(`${l.entityId}:${l.field}`) && l.oldValue) firstOld.set(`${l.entityId}:${l.field}`, l.oldValue);
  const snapshot: Record<string, { h: string; a: number; s: string }> = {};
  let demoted = 0, promoted = 0;
  for (const o of all) {
    const stageThen = firstOld.get(`${o.id}:stage`) ?? o.stage;
    if (["WON", "LOST", "DROPPED"].includes(stageThen)) continue;
    let h: string = o.healthLabel === "CLOSED" ? "HEALTHY" : o.healthLabel;
    if (o.healthLabel === "DYING" && demoted < 3) { h = "AT_RISK"; demoted++; }
    else if (o.healthLabel === "HOT" && promoted < 3) { h = "HEALTHY"; promoted++; }
    snapshot[o.id] = { h, a: Number(firstOld.get(`${o.id}:amount`) ?? o.amount), s: stageThen };
  }
  await db.pipelineReview.updateMany({ where: { reviewedAt: reviewAt }, data: { snapshot } });
  const counts = await db.opportunity.groupBy({ by: ["healthLabel"], _count: true });
  console.log(`Catalogue: ${productCount} products.`);
  console.log(`Seeded ${ACCOUNTS.length} accounts, ${n} opportunities. Health:`, counts.map((c) => `${c.healthLabel}=${c._count}`).join(" "));
  console.log(`Demo password for all users: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

export type { Prisma };
