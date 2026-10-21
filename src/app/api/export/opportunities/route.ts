import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listOpportunities } from "@/server/queries/opportunities";
import { STAGE_META, FORECAST_LABEL, HEALTH_LABEL, REVENUE_MODEL_LABEL, ACCOUNT_TYPE_LABEL, type StageKey } from "@/lib/constants";
import { FLAG_META, type FlagCode } from "@/lib/rules/flags";
import { isoDate } from "@/lib/format";
import { db } from "@/lib/db";

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
  const header = [
    "Code", "Opportunity", "Account", "Business Unit", "Category", "OEM", "Account Type", "Revenue Model", "Amount (INR)",
    "ARR (INR)", "Stage", "Probability %", "Forecast", "Expected Close", "Sales Person", "Presales Owner", "Health",
    "Health Score", "Concerns", "Last Activity", "Created",
  ];
  const lines = rows.map((o) =>
    [
      o.code, o.name, o.account.name, o.businessUnit.name, o.category.name, o.oem?.name, ACCOUNT_TYPE_LABEL[o.accountType],
      REVENUE_MODEL_LABEL[o.revenueModel], o.amount, o.arrAmount ?? "", STAGE_META[o.stage as StageKey].label, o.probability,
      FORECAST_LABEL[o.forecastCategory], isoDate(o.expectedCloseDate), o.salesOwner.name, o.presalesOwner?.name ?? "",
      HEALTH_LABEL[o.healthLabel], o.healthScore, o.flags.map((f) => FLAG_META[f as FlagCode]?.label ?? f).join("; "),
      isoDate(o.lastActivityAt), isoDate(o.createdAt),
    ].map(csvCell).join(","),
  );
  await db.auditLog.create({ data: { entityType: "Export", entityId: "opportunities", action: "EXPORT", newValue: `${rows.length} rows`, changedById: user.id } });
  const body = "﻿" + [header.join(","), ...lines].join("\r\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="opportunities-${isoDate(new Date())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
