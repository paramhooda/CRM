import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listOpportunities } from "@/server/queries/opportunities";
import { STAGE_META, FORECAST_LABEL, HEALTH_LABEL, REVENUE_MODEL_LABEL, ACCOUNT_TYPE_LABEL, type StageKey } from "@/lib/constants";
import { FLAG_META, type FlagCode } from "@/lib/rules/flags";
import { isoDate } from "@/lib/format";
import { db } from "@/lib/db";
import { billingPeriods, lineMultiplier } from "@/lib/boq";
import { BILLING_FREQUENCY_LABEL, LINE_BILLING_STATUS_LABEL } from "@/lib/constants";
import { toNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // neutralise spreadsheet formula injection
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const { rows } = await listOpportunities(user, sp, { all: true });
  const lineMode = sp.mode === "lines";
  let header: string[];
  let lines: string[];
  if (lineMode) {
    // One row per line item: the billing-ready view (same fields as the BillableLine contract)
    const items = await db.opportunityLineItem.findMany({
      where: { opportunityId: { in: rows.map((r) => r.id) } },
      orderBy: [{ opportunityId: "asc" }, { lineNo: "asc" }],
      include: {
        businessUnit: { select: { name: true } }, category: { select: { name: true } }, oem: { select: { name: true } },
        product: { select: { code: true, name: true, hsnSac: true, gstRatePct: true } },
        opportunity: { select: { code: true, name: true, stage: true, poNumber: true, poDate: true, account: { select: { name: true, gstin: true, city: true, state: true } }, salesOwner: { select: { name: true } } } },
      },
    });
    header = [
      "Opportunity Code", "Opportunity", "Stage", "Customer", "Customer GSTIN", "City", "State", "Sales Person", "PO Number", "PO Date",
      "Line", "Business Unit", "Category", "OEM", "Product Code", "Product", "Description", "HSN/SAC", "GST %", "Quantity", "Unit",
      "Billing", "Term (months)", "Periods", "Unit Cost (INR)", "Unit Price (INR)", "Amount per Period (INR)", "Taxable Value (INR)",
      "Billing Status", "Billing Start", "Finance Ref",
    ];
    lines = items.map((l) => {
      const o = l.opportunity;
      const price = l.unitPrice === null ? null : toNumber(l.unitPrice);
      return [
        o.code, o.name, STAGE_META[o.stage as StageKey].label, o.account.name, o.account.gstin, o.account.city, o.account.state, o.salesOwner.name,
        o.poNumber, isoDate(o.poDate), l.lineNo, l.businessUnit.name, l.category.name, l.oem.name, l.productCode ?? l.product?.code ?? "",
        l.productName ?? l.product?.name ?? "", l.description, l.hsnSac ?? l.product?.hsnSac ?? "",
        l.gstRatePct !== null ? toNumber(l.gstRatePct) : l.product ? toNumber(l.product.gstRatePct) : "", toNumber(l.quantity), l.unit,
        BILLING_FREQUENCY_LABEL[l.billingFrequency], l.termMonths ?? "", billingPeriods(l), l.unitCost === null ? "" : toNumber(l.unitCost),
        price ?? "", price === null ? "" : toNumber(l.quantity) * price, price === null ? "" : lineMultiplier(l) * price,
        LINE_BILLING_STATUS_LABEL[l.billingStatus], isoDate(l.billingStartDate), l.externalRef ?? "",
      ].map(csvCell).join(",");
    });
  } else {
    header = [
      "Code", "Opportunity", "Account", "Business Unit", "Category", "OEM", "Account Type", "Revenue Model", "Amount (INR)",
      "ARR (INR)", "Stage", "Probability %", "Forecast", "Expected Close", "Sales Person", "Presales Owner", "Health",
      "Health Score", "Concerns", "Last Activity", "Created",
    ];
    lines = rows.map((o) =>
      [
        o.code, o.name, o.account.name, o.businessUnit.name, o.category.name, o.oem?.name, ACCOUNT_TYPE_LABEL[o.accountType],
        REVENUE_MODEL_LABEL[o.revenueModel], o.amount, o.arrAmount ?? "", STAGE_META[o.stage as StageKey].label, o.probability,
        FORECAST_LABEL[o.forecastCategory], isoDate(o.expectedCloseDate), o.salesOwner.name, o.presalesOwner?.name ?? "",
        HEALTH_LABEL[o.healthLabel], o.healthScore, o.flags.map((f) => FLAG_META[f as FlagCode]?.label ?? f).join("; "),
        isoDate(o.lastActivityAt), isoDate(o.createdAt),
      ].map(csvCell).join(","),
    );
  }
  await db.auditLog.create({ data: { entityType: "Export", entityId: "opportunities", action: "EXPORT", newValue: `${lines.length} ${lineMode ? "line" : "deal"} rows`, changedById: user.id } });
  const body = "﻿" + [header.join(","), ...lines].join("\r\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${lineMode ? "line-items" : "opportunities"}-${isoDate(new Date())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
