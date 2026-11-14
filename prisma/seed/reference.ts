// Reference data: lookups, catalogue, people, approval rules and targets. Safe to run again (upserts by name/code).
import bcrypt from "bcryptjs";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { BUSINESS_UNITS, DOCUMENT_KINDS, INDUSTRIES, LEAD_SOURCES, LOSS_REASONS, OEMS, SALES_METHODS, SEGMENTS } from "./data/lookups";
import { PRODUCT_TEMPLATES, SUB_BU_OEMS } from "./data/products";
import { DEMO_PASSWORD, PEOPLE, emailOf } from "./data/people";
import { fiscalYearOf } from "../../src/domain/fiscal";

export type Reference = Awaited<ReturnType<typeof seedReference>>;

export async function seedReference(db: PrismaClient, log: (s: string) => void) {
  // Lookups
  const bus = new Map<string, { id: string; subs: Map<string, { id: string; needsPresales: boolean }> }>();
  for (const [i, bu] of BUSINESS_UNITS.entries()) {
    const row = await db.businessUnit.upsert({
      where: { name: bu.name },
      create: { name: bu.name, code: bu.code, colourToken: bu.colourToken, sortOrder: i },
      update: { code: bu.code, colourToken: bu.colourToken, sortOrder: i },
    });
    const subs = new Map<string, { id: string; needsPresales: boolean }>();
    for (const [j, sub] of bu.subBusinessUnits.entries()) {
      const s = await db.subBusinessUnit.upsert({
        where: { businessUnitId_name: { businessUnitId: row.id, name: sub.name } },
        create: { businessUnitId: row.id, name: sub.name, needsPresales: sub.needsPresales, sortOrder: j },
        update: { needsPresales: sub.needsPresales, sortOrder: j },
      });
      subs.set(sub.name, { id: s.id, needsPresales: sub.needsPresales });
    }
    bus.set(bu.name, { id: row.id, subs });
  }
  const oems = new Map<string, { id: string; isOwnIp: boolean }>();
  for (const [i, o] of OEMS.entries()) {
    const row = await db.oem.upsert({ where: { name: o.name }, create: { name: o.name, isOwnIp: o.isOwnIp, sortOrder: i }, update: { isOwnIp: o.isOwnIp, sortOrder: i } });
    oems.set(o.name, { id: row.id, isOwnIp: o.isOwnIp });
  }
  const simple = async (model: { upsert: (a: { where: { name: string }; create: { name: string; sortOrder: number }; update: { sortOrder: number } }) => Promise<{ id: string; name: string }> }, names: string[]) => {
    const m = new Map<string, string>();
    for (const [i, name] of names.entries()) m.set(name, (await model.upsert({ where: { name }, create: { name, sortOrder: i }, update: { sortOrder: i } })).id);
    return m;
  };
  const leadSources = await simple(db.leadSource, LEAD_SOURCES);
  const segments = await simple(db.segment, SEGMENTS);
  const industries = await simple(db.industry, INDUSTRIES);
  const salesMethods = await simple(db.salesMethod, SALES_METHODS);
  const lossReasons = new Map<string, string>();
  for (const [i, r] of LOSS_REASONS.entries())
    lossReasons.set(r.name, (await db.lossReason.upsert({ where: { name: r.name }, create: { name: r.name, appliesTo: r.appliesTo, sortOrder: i }, update: { appliesTo: r.appliesTo, sortOrder: i } })).id);
  const documentKinds = new Map<string, string>();
  for (const [i, k] of DOCUMENT_KINDS.entries())
    documentKinds.set(
      k.name,
      (
        await db.documentKind.upsert({
          where: { name: k.name },
          create: { name: k.name, restrictedToSales: k.restrictedToSales, requiredAtWon: k.requiredAtWon, sortOrder: i },
          update: { restrictedToSales: k.restrictedToSales, requiredAtWon: k.requiredAtWon, sortOrder: i },
        })
      ).id,
    );
  log(`Lookups: ${BUSINESS_UNITS.length} BUs, ${OEMS.length} OEMs`);

  // People (password only for demo; real installations change it at first sign-in)
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = new Map<string, { id: string; role: string; email: string }>();
  for (const p of PEOPLE) {
    const email = emailOf(p);
    const row = await db.user.upsert({
      where: { email },
      create: { fullName: p.fullName, email, role: p.role, title: p.title },
      update: { fullName: p.fullName, role: p.role, title: p.title, isActive: true },
    });
    await db.authIdentity.upsert({
      where: { userId_provider: { userId: row.id, provider: "PASSWORD" } },
      create: { userId: row.id, provider: "PASSWORD", providerSubject: email, passwordHash },
      update: { passwordHash },
    });
    users.set(p.fullName, { id: row.id, role: p.role, email });
  }
  for (const p of PEOPLE) {
    if (!p.manager) continue;
    await db.user.update({ where: { id: users.get(p.fullName)!.id }, data: { managerId: users.get(p.manager)!.id } });
  }
  log(`People: ${PEOPLE.length} (password ${DEMO_PASSWORD})`);

  // Catalogue
  const products: { id: string; name: string; bu: string; sub: string; oem: string; revenueModel: "ONE_TIME" | "ARR"; termMonths: number | null; listPrice: number; standardCost: number | null; unit: string }[] = [];
  let n = 0;
  for (const tpl of PRODUCT_TEMPLATES) {
    const key = `${tpl.businessUnit}|${tpl.subBusinessUnit}`;
    for (const oemName of SUB_BU_OEMS[key] ?? []) {
      const oem = oems.get(oemName)!;
      if (tpl.ownIpOnly && !oem.isOwnIp) continue;
      n++;
      const factor = oem.isOwnIp ? 1 : 0.9 + ((oemName.length * 7 + n * 3) % 25) / 100;
      const listPrice = Math.round((tpl.price * factor) / 10) * 10;
      const standardCost = oem.isOwnIp ? Math.round(listPrice * tpl.costRatio) : null;
      const name = `${oemName} ${tpl.name}`;
      const code = `PRD-${String(n).padStart(4, "0")}`;
      const bu = bus.get(tpl.businessUnit)!;
      const row = await db.product.upsert({
        where: { oemId_name: { oemId: oem.id, name } },
        create: {
          code, name, businessUnitId: bu.id, subBusinessUnitId: bu.subs.get(tpl.subBusinessUnit)!.id, oemId: oem.id, unit: tpl.unit,
          revenueModel: tpl.revenueModel, defaultTermMonths: tpl.termMonths ?? null, listPrice, standardCost, hsnSac: tpl.hsnSac,
        },
        update: { listPrice, standardCost, hsnSac: tpl.hsnSac, unit: tpl.unit, revenueModel: tpl.revenueModel, defaultTermMonths: tpl.termMonths ?? null },
      });
      products.push({ id: row.id, name, bu: tpl.businessUnit, sub: tpl.subBusinessUnit, oem: oemName, revenueModel: tpl.revenueModel, termMonths: tpl.termMonths ?? null, listPrice, standardCost, unit: tpl.unit });
    }
  }
  await db.sequence.upsert({ where: { key: "PRD" }, create: { key: "PRD", nextValue: BigInt(n + 1) }, update: { nextValue: BigInt(n + 1) } });
  log(`Catalogue: ${products.length} products`);

  // Approval rules (two examples; admins change them)
  const salesHeadRule = async (name: string, data: { gmBelowPct?: number; dealValueAtLeast?: number; isActive?: boolean }, steps: { kind: "OWNER_MANAGER" | "ROLE"; role?: "SALES_HEAD" | "ADMIN" }[]) => {
    const existing = await db.approvalRule.findUnique({ where: { name } });
    if (existing) return;
    await db.approvalRule.create({
      data: {
        name, ...data,
        steps: { create: steps.map((s, i) => ({ stepNo: i + 1, approverKind: s.kind, approverRole: s.role ?? null })) },
      },
    });
  };
  // Both examples start switched off: the owner turns approvals on from Admin → Approval rules when the process is set
  await salesHeadRule("Low margin: GM below 12%", { gmBelowPct: 12, isActive: false }, [{ kind: "OWNER_MANAGER" }, { kind: "ROLE", role: "SALES_HEAD" }]);
  await salesHeadRule("Large deal: ₹1 Cr or more", { dealValueAtLeast: 10_000_000, isActive: false }, [{ kind: "ROLE", role: "SALES_HEAD" }]);

  // Quarterly targets for every sales person, this fiscal year and the last
  const fy = fiscalYearOf(new Date());
  const salesPeople = PEOPLE.filter((p) => p.role === "SALES");
  for (const [i, p] of salesPeople.entries()) {
    const base = 30_000_000 + (i % 5) * 7_500_000;
    for (const year of [fy - 1, fy])
      for (const quarter of [1, 2, 3, 4]) {
        const targetValue = Math.round((base * (year === fy ? 1.1 : 1)) / 4);
        await db.salesTarget.upsert({
          where: { userId_fiscalYear_quarter: { userId: users.get(p.fullName)!.id, fiscalYear: year, quarter } },
          create: { userId: users.get(p.fullName)!.id, fiscalYear: year, quarter, targetValue },
          update: { targetValue },
        });
      }
  }
  log(`Targets: FY${String(fy - 1).slice(2)} and FY${String(fy).slice(2)} for ${salesPeople.length} sales people`);

  return { bus, oems, leadSources, segments, industries, salesMethods, lossReasons, documentKinds, users, products };
}
