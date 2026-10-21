export type Severity = "critical" | "serious" | "warning";

export const FLAG_META = {
  CLOSE_DATE_OVERDUE: {
    label: "Close date passed",
    severity: "critical",
    hint: "Expected close date is in the past while the deal is still open. Update the date or close the deal.",
  },
  NO_ACTIVITY: {
    label: "No activity 21d+",
    severity: "critical",
    hint: "No call, meeting or email logged for 21 days or more.",
  },
  STALE_STAGE: {
    label: "Stuck in stage",
    severity: "serious",
    hint: "Deal has been in the current stage longer than the typical cycle for that stage.",
  },
  CLOSE_DATE_SLIPPED: {
    label: "Close date slipped 3x+",
    severity: "serious",
    hint: "Expected close date has been pushed out three or more times.",
  },
  COMMIT_AT_RISK: {
    label: "Commit at risk",
    severity: "critical",
    hint: "Forecast is Commit but the deal is early-stage, overdue or inactive.",
  },
  NO_PRESALES: {
    label: "No presales at BOQ",
    severity: "serious",
    hint: "Deal is at BOQ or later without a presales owner.",
  },
  PRICING_PENDING: {
    label: "Pricing overdue",
    severity: "serious",
    hint: "Pricing request to Purchase is past its due date.",
  },
  PRESALES_OVERDUE: {
    label: "BOQ overdue",
    severity: "serious",
    hint: "Presales BOQ request is past its due date.",
  },
  LOW_MARGIN: {
    label: "Low margin",
    severity: "warning",
    hint: "Expected gross margin is below 8%.",
  },
  NO_NEXT_STEP: {
    label: "No next step",
    severity: "warning",
    hint: "No next step recorded, or the next step date has passed.",
  },
  SINGLE_THREADED: {
    label: "Single-threaded",
    severity: "warning",
    hint: "High-value deal (₹50 L+) with one or no customer contact engaged.",
  },
  NO_CONTACT: {
    label: "No contact",
    severity: "warning",
    hint: "No primary customer contact on the deal.",
  },
  ARR_TERM_MISSING: {
    label: "ARR term missing",
    severity: "warning",
    hint: "ARR deal without contract term or annual value.",
  },
  DEAL_REG_EXPIRING: {
    label: "Deal reg expiring",
    severity: "serious",
    hint: "OEM deal registration is pending, expired or expires within 15 days.",
  },
  SUBMISSION_DUE: {
    label: "RFP due soon",
    severity: "serious",
    hint: "RFP / tender submission due within 7 days and proposal not yet submitted.",
  },
} as const satisfies Record<string, { label: string; severity: Severity; hint: string }>;

export type FlagCode = keyof typeof FLAG_META;
export const FLAG_CODES = Object.keys(FLAG_META) as FlagCode[];

export const SEVERITY_RANK: Record<Severity, number> = { critical: 3, serious: 2, warning: 1 };

export function sortFlags(flags: string[]): FlagCode[] {
  return (flags.filter((f) => f in FLAG_META) as FlagCode[]).sort(
    (a, b) => SEVERITY_RANK[FLAG_META[b].severity] - SEVERITY_RANK[FLAG_META[a].severity],
  );
}
