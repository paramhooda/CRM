import { cn } from "@/lib/utils";
import { STAGE_META, type Stage } from "@/domain/stages";

/** One pill style everywhere: colour carries meaning, the text always says what it is. */
function Pill({ className, children, title }: { className?: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex h-6 max-w-full items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-medium", className)}>
      {children}
    </span>
  );
}

const STAGE_CLASS: Record<Stage, string> = {
  QUALIFIED: "bg-stage-qualified text-stage-qualified-foreground",
  BOQ: "bg-stage-boq text-stage-boq-foreground",
  PROPOSAL_SUBMITTED: "bg-stage-proposal text-stage-proposal-foreground",
  NEGOTIATION: "bg-stage-negotiation text-stage-negotiation-foreground",
  HOLD: "bg-stage-hold text-stage-hold-foreground",
  CLOSED_WON: "bg-stage-won text-stage-won-foreground",
  CLOSED_LOST: "bg-stage-lost text-stage-lost-foreground",
  DROPPED: "bg-stage-dropped text-stage-dropped-foreground",
};

export function StagePill({ stage, className }: { stage: Stage; className?: string }) {
  return <Pill className={cn(STAGE_CLASS[stage], className)}>{STAGE_META[stage].label}</Pill>;
}

const FORECAST_CLASS = { COMMIT: "bg-forecast-commit text-forecast-commit-foreground", UPSIDE: "bg-forecast-upside text-forecast-upside-foreground", PIPELINE: "bg-forecast-pipeline text-forecast-pipeline-foreground" } as const;
export const FORECAST_LABEL = { COMMIT: "Commit", UPSIDE: "Upside", PIPELINE: "Pipeline" } as const;

export function ForecastPill({ forecast, className }: { forecast: keyof typeof FORECAST_CLASS; className?: string }) {
  return <Pill className={cn(FORECAST_CLASS[forecast], className)}>{FORECAST_LABEL[forecast]}</Pill>;
}

const BU_CLASS: Record<string, string> = {
  "bu-iti": "bg-bu-iti-soft text-bu-iti-foreground",
  "bu-cloud": "bg-bu-cloud-soft text-bu-cloud-foreground",
  "bu-services": "bg-bu-services-soft text-bu-services-foreground",
  "bu-cyber": "bg-bu-cyber-soft text-bu-cyber-foreground",
};
export const BU_SOLID: Record<string, string> = { "bu-iti": "var(--bu-iti)", "bu-cloud": "var(--bu-cloud)", "bu-services": "var(--bu-services)", "bu-cyber": "var(--bu-cyber)" };

export function BuTag({ name, colourToken, className }: { name: string; colourToken: string; className?: string }) {
  return <Pill className={cn(BU_CLASS[colourToken] ?? "bg-muted text-muted-foreground", className)}>{name}</Pill>;
}

const STATUS_CLASS: Record<string, string> = {
  REQUESTED: "bg-stage-qualified text-stage-qualified-foreground",
  IN_PROGRESS: "bg-stage-proposal text-stage-proposal-foreground",
  SUBMITTED: "bg-stage-won text-stage-won-foreground",
  COMPLETED: "bg-stage-won text-stage-won-foreground",
  CANCELLED: "bg-stage-dropped text-stage-dropped-foreground",
  PENDING: "bg-stage-proposal text-stage-proposal-foreground",
  APPROVED: "bg-stage-won text-stage-won-foreground",
  REJECTED: "bg-stage-lost text-stage-lost-foreground",
  SUPERSEDED: "bg-stage-dropped text-stage-dropped-foreground",
  NEW: "bg-stage-qualified text-stage-qualified-foreground",
  CONTACTED: "bg-stage-boq text-stage-boq-foreground",
  QUALIFIED: "bg-stage-proposal text-stage-proposal-foreground",
  CONVERTED: "bg-stage-won text-stage-won-foreground",
  DISQUALIFIED: "bg-stage-dropped text-stage-dropped-foreground",
  OVERDUE: "bg-stage-lost text-stage-lost-foreground",
};
export const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Requested", IN_PROGRESS: "In progress", SUBMITTED: "Submitted", COMPLETED: "Completed", CANCELLED: "Cancelled",
  PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected", SUPERSEDED: "Superseded",
  NEW: "New", CONTACTED: "Contacted", QUALIFIED: "Qualified", CONVERTED: "Converted", DISQUALIFIED: "Disqualified", OVERDUE: "Overdue",
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return <Pill className={cn(STATUS_CLASS[status] ?? "bg-muted text-muted-foreground", className)}>{STATUS_LABEL[status] ?? status}</Pill>;
}

export function NeutralPill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Pill className={cn("bg-muted text-muted-foreground", className)}>{children}</Pill>;
}
