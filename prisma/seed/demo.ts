// Demo data: accounts, contacts, leads and deals spread across every stage, business unit and forecast category,
// with consistent back-dated stage history, requests, costs, approvals and a few weeks of audit rows so the home
// page and the pipeline review have something to show. Deterministic: the same data on every machine.
import type { PrismaClient } from "../../src/generated/prisma/client";
import type { Reference } from "./reference";
import { rng } from "./rng";
import { deriveLine, rollupDeal } from "../../src/domain/lines";
import { priceFingerprint } from "../../src/domain/approvals";
import { STAGE_META, type Stage } from "../../src/domain/stages";
import { fiscalYearOf, fyLabel } from "../../src/domain/fiscal";
import { PEOPLE } from "./data/people";

const DAY = 86_400_000;

const NAMED_ACCOUNTS = [
  { name: "Zenith Capital Finance Ltd", industry: "BFSI", segment: "Enterprise", city: "Mumbai", state: "Maharashtra" },
  { name: "Shakti Steel Industries", industry: "Manufacturing", segment: "Enterprise", city: "Pune", state: "Maharashtra" },
  { name: "Medisure Hospitals", industry: "Healthcare", segment: "Mid-market", city: "Hyderabad", state: "Telangana" },
  { name: "UrbanKart Retail Pvt Ltd", industry: "Retail & E-commerce", segment: "Mid-market", city: "Bengaluru", state: "Karnataka" },
  { name: "Infovista Technologies", industry: "IT / ITES", segment: "Enterprise", city: "Noida", state: "Uttar Pradesh" },
  { name: "Rajasthan Vidyut Vitran Nigam", industry: "Government / PSU", segment: "Government/PSU", city: "Jaipur", state: "Rajasthan" },
  { name: "CarePoint Diagnostics", industry: "Healthcare", segment: "SMB", city: "Chennai", state: "Tamil Nadu" },
  { name: "Vidyapeeth University", industry: "Education", segment: "Mid-market", city: "Bhopal", state: "Madhya Pradesh" },
  { name: "SwiftMove Logistics", industry: "Logistics", segment: "Mid-market", city: "Ahmedabad", state: "Gujarat" },
  { name: "Prism Media Network", industry: "Media & Entertainment", segment: "SMB", city: "Mumbai", state: "Maharashtra" },
];
const NAME_A = ["Apex", "Bharat", "Crest", "Deccan", "Everest", "Falcon", "Ganga", "Horizon", "Indus", "Jaipur", "Konark", "Lotus", "Meru", "Nirmal", "Orion", "Pioneer", "Quantum", "Raigad", "Sahyadri", "Tristar", "Unity", "Vikram", "Westline", "Yamuna", "Zephyr", "Aravali", "Bluebird", "Cascade", "Dhruv", "Emerald"];
const NAME_B = ["Textiles", "Pharma", "Motors", "Cements", "Agro Foods", "Infra Projects", "Softech", "Energy", "Hospitals", "Finserv", "Logistics", "Chemicals", "Polymers", "Electricals", "Engineering"];
const CITIES = [["Mumbai", "Maharashtra", "27"], ["Pune", "Maharashtra", "27"], ["Bengaluru", "Karnataka", "29"], ["Hyderabad", "Telangana", "36"], ["Chennai", "Tamil Nadu", "33"], ["Delhi", "Delhi", "07"], ["Gurugram", "Haryana", "06"], ["Noida", "Uttar Pradesh", "09"], ["Ahmedabad", "Gujarat", "24"], ["Jaipur", "Rajasthan", "08"], ["Kolkata", "West Bengal", "19"], ["Kochi", "Kerala", "32"], ["Indore", "Madhya Pradesh", "23"], ["Chandigarh", "Chandigarh", "04"]] as const;
const FIRST = ["Rekha", "Arun", "Priya", "Sameer", "Kavita", "Rohit", "Meena", "Vikas", "Anjali", "Deepak", "Sunita", "Manish", "Pooja", "Harish", "Neha", "Suresh", "Divya", "Rajesh", "Ritu", "Amit", "Lakshmi", "Nikhil", "Shreya", "Ganesh"];
const LAST = ["Menon", "Shah", "Nair", "Khan", "Rao", "Iyer", "Kulkarni", "Gupta", "Desai", "Verma", "Reddy", "Mehta", "Joshi", "Pillai", "Bose", "Saxena", "Patil", "Chawla"];
const TITLES = ["Head IT", "CIO", "IT Manager", "Procurement Head", "CFO", "Infrastructure Lead", "Security Head", "Purchase Manager", "CTO", "Admin Head"];
const DEAL_WORDS: Record<string, string[]> = {
  "IT Infrastructure": ["Server refresh", "Storage expansion", "Branch network upgrade", "Laptop rollout", "Virtualisation licences", "Core switch replacement", "Workstation refresh"],
  Cloud: ["Private cloud hosting", "DR as a service", "Cloud migration", "Colo move", "Public cloud commitment", "Managed hosting"],
  Services: ["24x7 NOC monitoring", "FMS for plants", "AMC renewal", "Implementation services", "Backup as a service"],
  Cybersecurity: ["Managed SOC", "Endpoint security licences", "Compliance assessment", "Firewall refresh", "Data classification"],
};
const STAGE_PLAN: [Stage, number][] = [["QUALIFIED", 36], ["BOQ", 24], ["PROPOSAL_SUBMITTED", 26], ["NEGOTIATION", 16], ["HOLD", 6], ["CLOSED_WON", 30], ["CLOSED_LOST", 16], ["DROPPED", 6]];

const tinyPdf = (title: string) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 20 50 Td (${title}) Tj ET\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF`);

export async function seedDemo(db: PrismaClient, ref: Reference, log: (s: string) => void) {
  const r = rng(20261113);
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);
  const dateOnly = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const sales = PEOPLE.filter((p) => p.role === "SALES").map((p) => ref.users.get(p.fullName)!);
  const presales = PEOPLE.filter((p) => p.role === "PRESALES").map((p) => ref.users.get(p.fullName)!);
  const purchase = PEOPLE.filter((p) => p.role === "PURCHASE").map((p) => ref.users.get(p.fullName)!);
  const vivek = ref.users.get("Vivek Malhotra")!;
  const admin = ref.users.get("System Administrator")!;
  const industries = [...ref.industries.entries()];
  const segments = [...ref.segments.entries()];
  const sources = [...ref.leadSources.values()];
  const lossLost = await db.lossReason.findMany({ where: { appliesTo: { in: ["LOST", "BOTH"] } } });
  const lossDropped = await db.lossReason.findMany({ where: { appliesTo: { in: ["DROPPED", "BOTH"] } } });
  const subs = await db.subBusinessUnit.findMany({ select: { id: true, needsPresales: true } });
  const needsPresalesSet = new Set(subs.filter((s) => s.needsPresales).map((s) => s.id));
  const buIdByName = new Map([...ref.bus.entries()].map(([name, b]) => [name, b.id]));
  const poKind = (await db.documentKind.findFirstOrThrow({ where: { requiredAtWon: true } })).id;

  // ── Accounts and contacts ──
  const accounts: { id: string; name: string; ownerId: string; domain: string; contacts: string[] }[] = [];
  let accNo = 0;
  const usedEmails = new Set<string>();
  const makeAccount = async (name: string, industry: string, segment: string, city: string, state: string, stateCode: string) => {
    accNo++;
    const owner = sales[(accNo - 1) % sales.length]!;
    const gstin = `${stateCode}${"ABCDEFGHJKLMNPQRSTUVWXYZ".slice(accNo % 20, accNo % 20 + 3)}${String.fromCharCode(65 + (accNo % 26))}${String.fromCharCode(65 + ((accNo * 7) % 26))}${String(1000 + accNo * 37).slice(-4)}${String.fromCharCode(65 + ((accNo * 3) % 26))}1Z${"0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"[(accNo * 11) % 34]}`;
    const domain = name.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 12) + ".example";
    const a = await db.account.create({
      data: { code: `ACC-${String(accNo).padStart(4, "0")}`, name, gstin, industryId: ref.industries.get(industry) ?? null, segmentId: ref.segments.get(segment) ?? null, city, state, addressLine: `${r.int(1, 99)}, ${r.pick(["MG Road", "Industrial Area", "IT Park", "Ring Road", "Station Road"])}`, pincode: String(r.int(110001, 695001)), website: `https://www.${domain.replace(".example", ".example.com")}`, ownerId: owner.id, createdById: admin.id, createdAt: daysAgo(r.int(60, 400)) },
    });
    await db.auditLog.create({ data: { entityType: "account", entityId: a.id, action: "CREATE", changedById: admin.id, changedAt: a.createdAt, newValue: `${a.code} ${a.name}` } });
    const contacts: string[] = [];
    for (let i = 0; i < r.int(2, 4); i++) {
      const first = r.pick(FIRST), last = r.pick(LAST);
      let email = `${first}.${last}@${domain}`.toLowerCase();
      if (usedEmails.has(email)) email = `${first}.${last}${r.int(2, 99)}@${domain}`.toLowerCase();
      usedEmails.add(email);
      const c = await db.contact.create({ data: { accountId: a.id, firstName: first, lastName: last, email, phone: `+91 ${r.int(70000, 99999)} ${r.int(10000, 99999)}`, designation: r.pick(TITLES), isPrimary: i === 0, createdById: owner.id, createdAt: a.createdAt } });
      contacts.push(c.id);
    }
    accounts.push({ id: a.id, name, ownerId: owner.id, domain, contacts });
  };
  for (const a of NAMED_ACCOUNTS) await makeAccount(a.name, a.industry, a.segment, a.city, a.state, CITIES.find((c) => c[0] === a.city)?.[2] ?? "27");
  const usedNames = new Set(NAMED_ACCOUNTS.map((a) => a.name));
  while (accounts.length < 40) {
    const name = `${r.pick(NAME_A)} ${r.pick(NAME_B)} ${r.pick(["Ltd", "Pvt Ltd", "LLP", "Industries"])}`;
    if (usedNames.has(name)) continue;
    usedNames.add(name);
    const city = r.pick(CITIES);
    await makeAccount(name, r.pick(industries)[0], r.pick(segments)[0], city[0], city[1], city[2]);
  }
  await db.sequence.upsert({ where: { key: "ACC" }, create: { key: "ACC", nextValue: BigInt(accNo + 1) }, update: { nextValue: BigInt(accNo + 1) } });
  log(`Accounts: ${accounts.length}, contacts: ${usedEmails.size}`);

  // ── Deals ──
  const products = ref.products;
  const byBu = new Map<string, typeof products>();
  for (const p of products) byBu.set(p.bu, [...(byBu.get(p.bu) ?? []), p]);
  const stages: Stage[] = STAGE_PLAN.flatMap(([s, n]) => Array<Stage>(n).fill(s));
  const fyCounters = new Map<string, number>();
  const dealIds: string[] = [];
  let approvalsMade = 0;
  let lowMarginLeft = 6;
  const commitInQualified = 2;
  const productCursor = r.shuffle(products);

  for (const [i, stage] of r.shuffle(stages).entries()) {
    const account = r.pick(accounts);
    const owner = account.ownerId;
    // Guarantee every product (hence every Sub BU and OEM) appears: the first lines walk the whole catalogue
    const lead = productCursor[i % productCursor.length]!;
    const bu = lead.bu;
    const pool = byBu.get(bu)!;
    const lineCount = r.int(1, 4);
    const chosen = [lead, ...r.shuffle(pool).filter((p) => p.id !== lead.id).slice(0, lineCount - 1)];
    if (r.chance(0.3)) chosen.push(r.pick(products)); // multi-BU deals
    const closed = stage === "CLOSED_WON" || stage === "CLOSED_LOST" || stage === "DROPPED";
    const priced = stage !== "QUALIFIED" && stage !== "BOQ" ? true : r.chance(0.35);
    const costed = priced || stage === "BOQ" ? r.chance(0.8) : false;
    const lowMargin = priced && lowMarginLeft > 0 && (stage === "BOQ" || stage === "QUALIFIED") && r.chance(0.8);
    if (lowMargin) lowMarginLeft--;
    const lines = chosen.map((p, idx) => {
      // Quantities sized to the price: a few big-ticket items, dozens of laptops, licences or devices
      const quantity = String(p.listPrice >= 1_000_000 ? r.int(1, 6) : p.listPrice >= 100_000 ? r.int(2, 20) : p.unit === "Nos" || p.unit === "Users" || p.unit === "Devices" || p.unit === "Cores" ? r.int(5, 60) : r.int(1, 12));
      const priceFactor = 0.9 + r.next() * 0.2;
      const unitSalesPrice = priced ? String(Math.round((p.listPrice * priceFactor) / 10) * 10) : null;
      const ownIp = ref.oems.get(p.oem)!.isOwnIp;
      const cost = ownIp ? p.standardCost : costed ? Math.round((p.listPrice * (lowMargin ? 0.95 : 0.78 + r.next() * 0.12)) / 10) * 10 : null;
      const unitPurchaseCost = cost === null ? null : String(cost);
      const revenueModel = p.revenueModel;
      const termMonths = revenueModel === "ARR" ? p.termMonths ?? 12 : null;
      const base = { productId: p.id, description: p.name, businessUnitId: ref.bus.get(p.bu)!.id, subBusinessUnitId: ref.bus.get(p.bu)!.subs.get(p.sub)!.id, oemId: ref.oems.get(p.oem)!.id, quantity, unit: p.unit, revenueModel, termMonths, unitSalesPrice, unitPurchaseCost, salesMethodId: ownIp ? null : r.pick([...ref.salesMethods.values()]) };
      return { ...base, lineNo: idx + 1, ...deriveLine(base) };
    });
    const roll = rollupDeal(lines);
    const needsPresales = lines.some((l) => needsPresalesSet.has(l.subBusinessUnitId));
    const path: Stage[] = needsPresales ? ["QUALIFIED", "BOQ", "PROPOSAL_SUBMITTED", "NEGOTIATION"] : ["QUALIFIED", "PROPOSAL_SUBMITTED", "NEGOTIATION"];
    // Where the deal got to along the path, then hold or close from there
    const reached: Stage = stage === "HOLD" ? r.pick(path) : closed ? (stage === "CLOSED_WON" ? r.pick(["PROPOSAL_SUBMITTED", "NEGOTIATION"] as Stage[]) : r.pick(path)) : stage;
    const walk = path.slice(0, path.indexOf(reached) + 1);
    const history: { from: Stage | null; to: Stage; at: Date; note: string | null }[] = [];
    let cursor = daysAgo(r.int(walk.length * 12 + 5, 150));
    const createdAt = cursor;
    history.push({ from: null, to: "QUALIFIED", at: cursor, note: "Created" });
    for (let k = 1; k < walk.length; k++) {
      cursor = new Date(cursor.getTime() + r.int(Math.round((STAGE_META[walk[k - 1]!].normDays ?? 20) * 0.4), Math.round((STAGE_META[walk[k - 1]!].normDays ?? 20) * 1.6)) * DAY);
      if (cursor > now) cursor = daysAgo(r.int(0, 3));
      history.push({ from: walk[k - 1]!, to: walk[k]!, at: cursor, note: null });
    }
    let holdReason: string | null = null, lossReasonId: string | null = null, poNumber: string | null = null, closedAt: Date | null = null;
    if (stage === "HOLD") {
      cursor = new Date(Math.min(cursor.getTime() + r.int(3, 20) * DAY, now.getTime() - DAY));
      holdReason = r.pick(["Budget review in Q4", "Customer re-evaluating scope", "Decision maker on leave", "Waiting for board approval"]);
      history.push({ from: reached, to: "HOLD", at: cursor, note: holdReason });
    } else if (closed) {
      cursor = new Date(Math.min(cursor.getTime() + r.int(2, 25) * DAY, now.getTime() - DAY));
      closedAt = cursor;
      if (stage === "CLOSED_WON") poNumber = `PO/${account.name.split(" ")[0]!.toUpperCase().slice(0, 4)}/${fyLabel(fiscalYearOf(cursor))}/${r.int(100, 999)}`;
      else lossReasonId = r.pick(stage === "CLOSED_LOST" ? lossLost : lossDropped).id;
      history.push({ from: reached, to: stage, at: cursor, note: poNumber ? `PO ${poNumber}` : (stage === "CLOSED_LOST" ? lossLost : lossDropped).find((l) => l.id === lossReasonId)!.name });
    }
    const stageEnteredAt = history[history.length - 1]!.at;
    const fy = fiscalYearOf(createdAt);
    const key = `OPP-${fyLabel(fy)}`;
    const n = (fyCounters.get(key) ?? 0) + 1;
    fyCounters.set(key, n);
    const forecast = closed || stage === "HOLD" ? "PIPELINE" : stage === "PROPOSAL_SUBMITTED" || stage === "NEGOTIATION" ? (r.chance(0.4) ? "COMMIT" : r.chance(0.6) ? "UPSIDE" : "PIPELINE") : i < commitInQualified ? "COMMIT" : r.chance(0.15) ? "UPSIDE" : "PIPELINE";
    const expectedCloseDate = closed ? dateOnly(closedAt!) : dateOnly(r.chance(0.08) ? daysAgo(r.int(1, 30)) : new Date(now.getTime() + r.int(5, 200) * DAY));
    const contactId = r.pick(account.contacts);
    const deal = await db.deal.create({
      data: {
        code: `${key}-${String(n).padStart(4, "0")}`, name: `${account.name.split(" ").slice(0, 2).join(" ")} ${r.pick(DEAL_WORDS[bu]!)}`, accountId: account.id, primaryContactId: contactId, ownerId: owner,
        presalesOwnerId: needsPresales && walk.length > 1 ? r.pick(presales).id : null, stage, stageEnteredAt, heldFromStage: stage === "HOLD" ? reached : null, lastOpenStage: closed ? reached : null,
        forecastCategory: forecast, expectedCloseDate, needsPresales, leadSourceId: r.pick(sources), description: r.chance(0.6) ? `${r.pick(DEAL_WORDS[bu]!)} for ${account.name}.` : null,
        nextStep: closed ? null : r.chance(0.8) ? r.pick(["Share proposal", "Demo scheduled", "Follow up with procurement", "Negotiate payment terms", "Site survey", "Collect PO", "Technical workshop"]) : null,
        nextStepDate: closed ? null : r.chance(0.7) ? dateOnly(new Date(now.getTime() + r.int(-5, 20) * DAY)) : null,
        holdReason, lossReasonId, poNumber, closedAt, ...roll, priceFingerprint: "", createdById: owner, createdAt, updatedAt: stageEnteredAt,
        lines: { create: lines.map((l) => ({ ...l, updatedById: owner, costSetById: l.unitPurchaseCost ? (ref.oems.get(chosen[l.lineNo - 1]!.oem)!.isOwnIp ? owner : purchase[0]!.id) : null, costSetAt: l.unitPurchaseCost ? stageEnteredAt : null, createdAt })) },
        stageHistory: { create: history.map((h, k) => ({ fromStage: h.from, toStage: h.to, changedById: owner, changedAt: h.at, daysInPreviousStage: k === 0 ? null : Math.round(((h.at.getTime() - history[k - 1]!.at.getTime()) / DAY) * 100) / 100, dealValueAtChange: roll.dealValue, note: h.note })) },
      },
      include: { lines: true },
    });
    await db.deal.update({ where: { id: deal.id }, data: { priceFingerprint: priceFingerprint(deal.lines) } });
    dealIds.push(deal.id);
    // audit: creation and every stage change
    await db.auditLog.create({ data: { entityType: "deal", entityId: deal.id, dealId: deal.id, action: "CREATE", changedById: owner, changedAt: createdAt, newValue: `${deal.code} ${deal.name}` } });
    for (const h of history.slice(1)) await db.auditLog.create({ data: { entityType: "deal", entityId: deal.id, dealId: deal.id, action: "STAGE_CHANGE", field: "stage", oldValue: h.from, newValue: h.to, changedById: owner, changedAt: h.at } });
    // requests
    if (needsPresales && walk.includes("BOQ")) {
      const boqAt = history.find((h) => h.to === "BOQ")!.at;
      const submitted = walk.indexOf("BOQ") < walk.length - 1 || closed;
      const inBoq = stage === "BOQ";
      await db.presalesRequest.create({ data: { dealId: deal.id, requestedById: owner, assignedToId: deal.presalesOwnerId!, dueDate: dateOnly(new Date(boqAt.getTime() + r.int(5, 14) * DAY)), scope: `BOQ for ${deal.name}`, status: submitted ? "SUBMITTED" : inBoq ? (r.chance(0.5) ? "IN_PROGRESS" : "REQUESTED") : "CANCELLED", requestedAt: boqAt, startedAt: submitted || r.chance(0.5) ? new Date(boqAt.getTime() + DAY) : null, submittedAt: submitted ? new Date(boqAt.getTime() + r.int(3, 12) * DAY) : null, summary: submitted ? "Sized and specified with the customer's IT team." : null } });
    }
    if (lines.some((l) => !ref.oems.get(chosen[l.lineNo - 1]!.oem)!.isOwnIp)) {
      const pricingAt = new Date(createdAt.getTime() + r.int(2, 10) * DAY);
      const complete = costed && priced;
      if (complete || stage === "BOQ" || (stage === "QUALIFIED" && r.chance(0.3)))
        await db.pricingRequest.create({ data: { dealId: deal.id, requestedById: owner, assignedToId: r.pick(purchase).id, dueDate: dateOnly(new Date(pricingAt.getTime() + r.int(3, 10) * DAY)), notes: "Best supplier price, 30-day validity.", status: complete ? "COMPLETED" : closed ? "CANCELLED" : r.chance(0.5) ? "IN_PROGRESS" : "REQUESTED", requestedAt: pricingAt, startedAt: complete ? new Date(pricingAt.getTime() + DAY) : null, completedAt: complete ? new Date(pricingAt.getTime() + r.int(2, 8) * DAY) : null, completionNotes: complete ? "Ingram Micro, valid 30 days" : null } });
    }
    // approvals on low-margin deals
    if (lowMargin && roll.expectedGmPct !== null) {
      approvalsMade++;
      const status = approvalsMade <= 3 ? "APPROVED" : approvalsMade <= 5 ? "PENDING" : "REJECTED";
      const manager = sales.find((s) => s.id === owner)!;
      const managerId = (await db.user.findUnique({ where: { id: manager.id }, select: { managerId: true } }))!.managerId ?? vivek.id;
      await db.dealApproval.create({
        data: {
          dealId: deal.id, requestedById: owner, requestedAt: daysAgo(r.int(1, 10)), status, priceFingerprint: priceFingerprint(deal.lines), dealValue: roll.dealValue, gmPct: roll.expectedGmPct, reasons: [`Low margin: GM below 12%: GM ${Number(roll.expectedGmPct).toFixed(1)}% is below 12.0%`], currentStep: status === "PENDING" ? 1 : 2, decidedAt: status === "PENDING" ? null : daysAgo(r.int(0, 3)),
          steps: { create: [
            { stepNo: 1, label: `${(await db.user.findUnique({ where: { id: managerId } }))!.fullName} (manager)`, approverUserIds: [managerId], decision: status === "PENDING" ? null : status === "REJECTED" ? "REJECTED" : "APPROVED", decidedById: status === "PENDING" ? null : managerId, decidedAt: status === "PENDING" ? null : daysAgo(2), note: status === "REJECTED" ? "Margin too thin for a new logo" : null },
            { stepNo: 2, label: "Any Sales Head", approverUserIds: [vivek.id, ref.users.get("Anita Deshmukh")!.id].filter((id) => id !== owner), decision: status === "APPROVED" ? "APPROVED" : null, decidedById: status === "APPROVED" ? vivek.id : null, decidedAt: status === "APPROVED" ? daysAgo(1) : null },
          ] },
        },
      });
    }
    // PO document on won deals
    if (stage === "CLOSED_WON") await db.dealDocument.create({ data: { dealId: deal.id, documentKindId: poKind, fileName: `${poNumber!.replace(/\//g, "-")}.pdf`, contentType: "application/pdf", content: tinyPdf(`Purchase order ${poNumber}`), sizeBytes: tinyPdf("x").byteLength, uploadedById: owner, uploadedAt: closedAt! } });
    // recent changes for the review: value changes, close-date pushes, forecast changes
    if (!closed && r.chance(0.45)) {
      const when = daysAgo(r.int(1, 40));
      const kind = r.pick(["value", "push", "forecast"]);
      if (kind === "value") await db.auditLog.create({ data: { entityType: "deal", entityId: deal.id, dealId: deal.id, action: "UPDATE", field: "dealValue", oldValue: String(Math.round(Number(roll.dealValue) * (0.7 + r.next() * 0.5))), newValue: String(Number(roll.dealValue)), changedById: owner, changedAt: when } });
      else if (kind === "push") await db.auditLog.create({ data: { entityType: "deal", entityId: deal.id, dealId: deal.id, action: "UPDATE", field: "expectedCloseDate", oldValue: new Date(expectedCloseDate.getTime() - r.int(10, 45) * DAY).toISOString().slice(0, 10), newValue: expectedCloseDate.toISOString().slice(0, 10), changedById: owner, changedAt: when } });
      else await db.auditLog.create({ data: { entityType: "deal", entityId: deal.id, dealId: deal.id, action: "UPDATE", field: "forecastCategory", oldValue: forecast === "COMMIT" ? "UPSIDE" : "PIPELINE", newValue: forecast, changedById: owner, changedAt: when } });
    }
  }
  for (const [key, n] of fyCounters) await db.sequence.upsert({ where: { key }, create: { key, nextValue: BigInt(n + 1) }, update: { nextValue: BigInt(n + 1) } });
  log(`Deals: ${dealIds.length} (${STAGE_PLAN.map(([s, n]) => `${STAGE_META[s].label} ${n}`).join(", ")}), approvals: ${approvalsMade}`);

  // ── Leads ──
  const leadStatuses = [...Array<"NEW">(10).fill("NEW"), ...Array<"CONTACTED">(8).fill("CONTACTED"), ...Array<"QUALIFIED">(5).fill("QUALIFIED"), ...Array<"CONVERTED">(4).fill("CONVERTED"), ...Array<"DISQUALIFIED">(3).fill("DISQUALIFIED")];
  let leadNo = 0;
  for (const status of leadStatuses) {
    leadNo++;
    const owner = sales[(leadNo * 5) % sales.length]!;
    const first = r.pick(FIRST), last = r.pick(LAST);
    const company = status === "CONVERTED" ? r.pick(accounts) : null;
    const companyName = company?.name ?? `${r.pick(NAME_A)} ${r.pick(NAME_B)} Ltd`;
    const buName = r.pick([...buIdByName.keys()]);
    const convertedDeal = company ? await db.deal.findFirst({ where: { accountId: company.id } }) : null;
    await db.lead.create({
      data: {
        code: `LEAD-${String(leadNo).padStart(4, "0")}`, companyName, contactName: `${first} ${last}`, contactEmail: `${first}.${last}@${companyName.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 10)}.example`.toLowerCase(), contactPhone: `+91 ${r.int(70000, 99999)} ${r.int(10000, 99999)}`, designation: r.pick(TITLES),
        leadSourceId: sources[leadNo % sources.length]!, industryId: r.pick(industries)[1], segmentId: r.pick(segments)[1], businessUnitId: buIdByName.get(buName)!, estimatedValue: String(r.int(5, 400) * 100_000), notes: `${r.pick(DEAL_WORDS[buName]!)} enquiry.`, status, ownerId: owner.id,
        disqualifyReason: status === "DISQUALIFIED" ? r.pick(["No budget this year", "Not a fit", "Went with incumbent"]) : null,
        convertedAt: status === "CONVERTED" ? daysAgo(r.int(10, 90)) : null, convertedAccountId: company?.id ?? null, convertedContactId: company ? company.contacts[0] : null, convertedDealId: convertedDeal?.id ?? null,
        createdById: owner.id, createdAt: daysAgo(r.int(1, 120)),
      },
    });
  }
  await db.sequence.upsert({ where: { key: "LEAD" }, create: { key: "LEAD", nextValue: BigInt(leadNo + 1) }, update: { nextValue: BigInt(leadNo + 1) } });
  log(`Leads: ${leadNo}`);

  // ── A review two weeks ago, so "since last review" has a baseline ──
  await db.pipelineReview.create({ data: { reviewedById: vivek.id, reviewedAt: daysAgo(14), scope: "EVERYONE", subjectUserIds: sales.map((s) => s.id), sinceDate: daysAgo(28), notes: "Fortnightly pipeline call. Push proposals out before quarter end." } });
  log("Pipeline review: 1 (14 days ago)");
}
