// Domain constants shared by server, client, seed and rules engine.
// Kept free of Prisma imports so it can be used from client components.

export const STAGES = [
  "IDENTIFIED",
  "QUALIFIED",
  "BOQ",
  "PROPOSAL",
  "NEGOTIATION",
  "HOLD",
  "WON",
  "LOST",
  "DROPPED",
] as const;
export type StageKey = (typeof STAGES)[number];

export const OPEN_STAGES: StageKey[] = ["IDENTIFIED", "QUALIFIED", "BOQ", "PROPOSAL", "NEGOTIATION", "HOLD"];
export const ACTIVE_STAGES: StageKey[] = ["IDENTIFIED", "QUALIFIED", "BOQ", "PROPOSAL", "NEGOTIATION"];
export const CLOSED_STAGES: StageKey[] = ["WON", "LOST", "DROPPED"];

export const STAGE_META: Record<
  StageKey,
  { label: string; probability: number; order: number; staleAfterDays: number; tone: Tone }
> = {
  IDENTIFIED: { label: "Opportunity Identified", probability: 10, order: 1, staleAfterDays: 30, tone: "slate" },
  QUALIFIED: { label: "Qualified", probability: 20, order: 2, staleAfterDays: 30, tone: "blue" },
  BOQ: { label: "BOQ", probability: 40, order: 3, staleAfterDays: 21, tone: "violet" },
  PROPOSAL: { label: "Proposal Submitted", probability: 60, order: 4, staleAfterDays: 30, tone: "amber" },
  NEGOTIATION: { label: "Negotiation", probability: 80, order: 5, staleAfterDays: 21, tone: "orange" },
  HOLD: { label: "Hold", probability: 0, order: 6, staleAfterDays: 45, tone: "slate" },
  WON: { label: "Closed-Won", probability: 100, order: 7, staleAfterDays: 0, tone: "green" },
  LOST: { label: "Closed-Lost", probability: 0, order: 8, staleAfterDays: 0, tone: "red" },
  DROPPED: { label: "Dropped", probability: 0, order: 9, staleAfterDays: 0, tone: "slate" },
};

export type Tone = "slate" | "blue" | "violet" | "amber" | "orange" | "green" | "red" | "aqua";

export const FORECASTS = ["COMMIT", "UPSIDE", "PIPELINE", "OMITTED"] as const;
export type ForecastKey = (typeof FORECASTS)[number];
export const FORECAST_LABEL: Record<ForecastKey, string> = {
  COMMIT: "Commit",
  UPSIDE: "Upside",
  PIPELINE: "Pipeline",
  OMITTED: "Omitted",
};

export const ACCOUNT_TYPE_LABEL = { NEW_LOGO: "New Logo", EXISTING: "Existing" } as const;
export const REVENUE_MODEL_LABEL = { ONE_TIME: "One time", ARR: "ARR" } as const;
export const DEAL_TYPE_LABEL = {
  NEW_BUSINESS: "New business",
  UPSELL: "Upsell",
  CROSS_SELL: "Cross-sell",
  RENEWAL: "Renewal",
} as const;
export const PROCUREMENT_LABEL = { DIRECT: "Direct", RFQ: "RFQ", RFP: "RFP", TENDER: "Tender / GeM" } as const;
export const DEAL_REG_LABEL = {
  NOT_REQUIRED: "Not required",
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
} as const;
export const SEGMENT_LABEL = {
  ENTERPRISE: "Enterprise",
  MID_MARKET: "Mid-market",
  SMB: "SMB",
  GOVT_PSU: "Govt / PSU",
} as const;
export const ACCOUNT_STATUS_LABEL = { PROSPECT: "Prospect", ACTIVE: "Active", DORMANT: "Dormant" } as const;
export const CONTACT_ROLE_LABEL = {
  DECISION_MAKER: "Decision maker",
  INFLUENCER: "Influencer",
  CHAMPION: "Champion",
  TECHNICAL_EVALUATOR: "Technical evaluator",
  PROCUREMENT: "Procurement",
  FINANCE: "Finance",
  END_USER: "End user",
} as const;
export const LEAD_STATUS_LABEL = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  UNQUALIFIED: "Unqualified",
  CONVERTED: "Converted",
} as const;
export const ACTIVITY_TYPE_LABEL = {
  CALL: "Call",
  EMAIL: "Email",
  MEETING: "Meeting",
  DEMO: "Demo / PoC",
  SITE_VISIT: "Site visit",
  NOTE: "Note",
  TASK: "Task",
} as const;
export const ROLE_LABEL = {
  ADMIN: "Administrator",
  SALES_HEAD: "Sales Head",
  SALES: "Sales",
  PRESALES: "Presales",
  PURCHASE: "Purchase",
} as const;
export const PRESALES_STATUS_LABEL = {
  REQUESTED: "Requested",
  IN_PROGRESS: "In progress",
  BOQ_SUBMITTED: "BOQ submitted",
  CANCELLED: "Cancelled",
} as const;
export const PRICING_STATUS_LABEL = {
  REQUESTED: "Requested",
  IN_PROGRESS: "In progress",
  QUOTED: "Priced",
  CANCELLED: "Cancelled",
} as const;
export const HEALTH_LABEL = {
  HOT: "Hot",
  HEALTHY: "Healthy",
  AT_RISK: "At risk",
  DYING: "Dying",
  CLOSED: "Closed",
} as const;
export type HealthKey = keyof typeof HEALTH_LABEL;

export const BILLING_FREQUENCY_LABEL = {
  ONE_TIME: "One-time",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUAL: "Annual",
} as const;
export const PRODUCT_TYPE_LABEL = {
  HARDWARE: "Hardware",
  SOFTWARE_LICENCE: "Software licence",
  SUBSCRIPTION: "Subscription",
  SERVICE: "Service",
  SUPPORT_AMC: "Support / AMC",
} as const;
export const LINE_BILLING_STATUS_LABEL = {
  NOT_READY: "Not ready",
  READY: "Ready to bill",
  SENT: "Sent to finance",
  INVOICED: "Invoiced",
} as const;

export const PICKLIST_TYPES = {
  INDUSTRY: "Industry",
  LEAD_SOURCE: "Lead source",
  LOSS_REASON: "Loss reason",
  COMPETITOR: "Competitor",
  DISTRIBUTOR: "Distributor",
} as const;
export type PicklistType = keyof typeof PICKLIST_TYPES;

/** Thresholds used across rules, dashboards and seed. Tuned for an Indian SI/MSP sales cycle. */
export const THRESHOLDS = {
  noActivityDays: 21,
  warmActivityDays: 7,
  overdueGraceDays: 14,
  slipCountConcern: 3,
  lowMarginPct: 8,
  highValueAmount: 5_000_000, // ₹50 L
  pricingSlaDays: 5,
  presalesSlaDays: 7,
  dealRegExpiryWarnDays: 15,
  rfpDueWarnDays: 7,
  renewalWindowDays: 120,
} as const;
