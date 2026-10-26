import { z } from "zod";
import { STAGES } from "./constants";

const optStr = (max = 500) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().trim().max(max).optional());
const optDate = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.date().optional());
const optNum = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number().finite().optional());
const optInt = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number().int().optional());

export const opportunitySchema = z
  .object({
    name: z.string().trim().min(3, "Name is required").max(160),
    accountId: z.string().min(1, "Select an account"),
    primaryContactId: optStr(40),
    // Business unit, category, OEM and value are derived from the line items, never entered on the deal
    businessUnitId: optStr(40),
    categoryId: optStr(40),
    oemId: optStr(40),
    accountType: z.enum(["NEW_LOGO", "EXISTING"]),
    revenueModel: z.enum(["ONE_TIME", "ARR"]),
    dealType: z.enum(["NEW_BUSINESS", "UPSELL", "CROSS_SELL", "RENEWAL"]),
    procurementMode: z.enum(["DIRECT", "RFQ", "RFP", "TENDER"]),
    amount: optNum,
    arrAmount: optNum,
    contractTermMonths: optInt,
    contractStartDate: optDate,
    expectedMarginPct: optNum.refine((v) => v === undefined || (v > -100 && v < 100), "Margin must be between -100 and 100"),
    stage: z.enum(STAGES),
    probability: z.coerce.number().int().min(0).max(100),
    forecastCategory: z.enum(["COMMIT", "UPSIDE", "PIPELINE", "OMITTED"]),
    expectedCloseDate: z.coerce.date({ invalid_type_error: "Expected close date is required" }),
    salesOwnerId: z.string().min(1),
    presalesOwnerId: optStr(40),
    leadSource: optStr(80),
    competitors: optStr(200),
    nextStep: optStr(300),
    nextStepDate: optDate,
    submissionDueDate: optDate,
    dealRegStatus: z.enum(["NOT_REQUIRED", "PENDING", "APPROVED", "REJECTED", "EXPIRED"]),
    dealRegNumber: optStr(60),
    dealRegExpiry: optDate,
    lossReason: optStr(120),
    lossNotes: optStr(1000),
    poNumber: optStr(80),
    poDate: optDate,
    description: optStr(4000),
  })
  .superRefine((v, ctx) => {
    if (v.revenueModel === "ARR") {
      if (!v.contractTermMonths || v.contractTermMonths < 1)
        ctx.addIssue({ path: ["contractTermMonths"], code: "custom", message: "Contract term is required for ARR deals" });
    }
    if (v.stage === "WON") {
      if (!v.poNumber) ctx.addIssue({ path: ["poNumber"], code: "custom", message: "PO number is required to close as won" });
      if (!v.poDate) ctx.addIssue({ path: ["poDate"], code: "custom", message: "PO date is required to close as won" });
    }
    if ((v.stage === "LOST" || v.stage === "DROPPED") && !v.lossReason)
      ctx.addIssue({ path: ["lossReason"], code: "custom", message: "Select a reason" });
    if (v.dealRegStatus === "APPROVED" && !v.dealRegNumber)
      ctx.addIssue({ path: ["dealRegNumber"], code: "custom", message: "Deal registration number is required once approved" });
    if ((v.procurementMode === "RFP" || v.procurementMode === "TENDER") && !v.submissionDueDate)
      ctx.addIssue({ path: ["submissionDueDate"], code: "custom", message: "Submission due date is required for RFP / tender" });
  });

export type OpportunityInput = z.infer<typeof opportunitySchema>;

export const stageChangeSchema = z.object({
  stage: z.enum(STAGES),
  lossReason: optStr(120),
  lossNotes: optStr(1000),
  poNumber: optStr(80),
  poDate: optDate,
  /** Reason for a hold, a correction or a reopen */
  note: optStr(500),
});

export const accountSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(160),
  industry: optStr(80),
  segment: z.enum(["ENTERPRISE", "MID_MARKET", "SMB", "GOVT_PSU"]),
  status: z.enum(["PROSPECT", "ACTIVE", "DORMANT"]),
  website: optStr(200),
  phone: optStr(40),
  gstin: z.preprocess(
    (v) => (v === "" || v === null ? undefined : String(v).toUpperCase().trim()),
    z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, "Enter a valid 15-character GSTIN").optional(),
  ),
  pan: z.preprocess(
    (v) => (v === "" || v === null ? undefined : String(v).toUpperCase().trim()),
    z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Enter a valid PAN").optional(),
  ),
  addressLine: optStr(300),
  city: optStr(80),
  state: optStr(80),
  pincode: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().regex(/^\d{6}$/, "6-digit PIN code").optional()),
  annualRevenueCr: optNum,
  employees: optInt,
  ownerId: z.string().min(1),
  description: optStr(2000),
});

export const contactSchema = z.object({
  accountId: z.string().min(1, "Select an account"),
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  title: optStr(120),
  department: optStr(80),
  email: z.preprocess((v) => (v === "" ? undefined : v), z.string().email("Enter a valid email").optional()),
  phone: optStr(40),
  mobile: optStr(40),
  role: z.enum(["DECISION_MAKER", "INFLUENCER", "CHAMPION", "TECHNICAL_EVALUATOR", "PROCUREMENT", "FINANCE", "END_USER"]),
  isPrimary: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()),
  linkedin: optStr(200),
  notes: optStr(2000),
});

export const leadSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  company: z.string().trim().min(2, "Company is required").max(160),
  title: optStr(120),
  email: z.preprocess((v) => (v === "" ? undefined : v), z.string().email("Enter a valid email").optional()),
  phone: optStr(40),
  city: optStr(80),
  source: optStr(80),
  businessUnitId: optStr(40),
  requirement: optStr(2000),
  estimatedValue: optNum,
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED"]),
  ownerId: z.string().min(1),
  disqualifyReason: optStr(300),
});

export const activitySchema = z.object({
  type: z.enum(["CALL", "EMAIL", "MEETING", "DEMO", "SITE_VISIT", "NOTE", "TASK"]),
  subject: z.string().trim().min(2, "Subject is required").max(200),
  body: optStr(4000),
  occurredAt: optDate,
  dueAt: optDate,
  opportunityId: optStr(40),
  accountId: optStr(40),
  contactId: optStr(40),
});

export type ActionResult<T = unknown> =
  | { ok: true; data?: T; warning?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function zodErrors(e: z.ZodError): { error: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  for (const i of e.issues) {
    const k = i.path.join(".");
    if (!fieldErrors[k]) fieldErrors[k] = i.message;
  }
  return { error: e.issues[0]?.message ?? "Please check the form", fieldErrors };
}

export function formToObject(form: FormData): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) o[k] = typeof v === "string" ? v : undefined;
  return o;
}
