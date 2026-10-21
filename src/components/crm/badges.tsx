import { Flame, HeartPulse, AlertTriangle, Skull, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  STAGE_META, FORECAST_LABEL, HEALTH_LABEL, type StageKey, type ForecastKey, type HealthKey, type Tone,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

export function StageBadge({ stage }: { stage: string }) {
  const m = STAGE_META[stage as StageKey];
  return <Badge tone={m?.tone ?? "slate"}>{m?.label ?? stage}</Badge>;
}

const FC_TONE: Record<ForecastKey, Tone> = { COMMIT: "green", UPSIDE: "blue", PIPELINE: "slate", OMITTED: "slate" };
export function ForecastBadge({ value }: { value: string }) {
  return <Badge tone={FC_TONE[value as ForecastKey] ?? "slate"}>{FORECAST_LABEL[value as ForecastKey] ?? value}</Badge>;
}

const HEALTH_STYLE: Record<HealthKey, { tone: Tone; Icon: typeof Flame; color: string }> = {
  HOT: { tone: "orange", Icon: Flame, color: "var(--serious)" },
  HEALTHY: { tone: "green", Icon: HeartPulse, color: "var(--good)" },
  AT_RISK: { tone: "amber", Icon: AlertTriangle, color: "var(--warning)" },
  DYING: { tone: "red", Icon: Skull, color: "var(--critical)" },
  CLOSED: { tone: "slate", Icon: CheckCircle2, color: "var(--ink-3)" },
};

/** Health is always icon + label, never colour alone. */
export function HealthBadge({ label, score, compact }: { label: string; score?: number; compact?: boolean }) {
  const st = HEALTH_STYLE[label as HealthKey] ?? HEALTH_STYLE.HEALTHY;
  const Icon = st.Icon;
  return (
    <Badge tone={st.tone} className="gap-1">
      <Icon className="size-3" />
      {!compact && HEALTH_LABEL[label as HealthKey]}
      {score !== undefined && label !== "CLOSED" && <span className="tabular opacity-70">{score}</span>}
    </Badge>
  );
}

export function healthColor(label: string) {
  return HEALTH_STYLE[label as HealthKey]?.color ?? "var(--ink-3)";
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  // deterministic tint per person
  const tones: Tone[] = ["blue", "violet", "aqua", "amber", "orange", "green", "red", "slate"];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const tone = tones[h % tones.length]!;
  return (
    <span
      title={name}
      className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold", className)}
      style={{ background: `var(--t-${tone}-bg)`, color: `var(--t-${tone})` }}
    >
      {initials(name)}
    </span>
  );
}

export function PersonCell({ name, sub }: { name?: string | null; sub?: string | null }) {
  if (!name) return <span className="text-ink-3">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar name={name} />
      <span className="min-w-0">
        <span className="block truncate">{name}</span>
        {sub && <span className="block truncate text-xs text-ink-3">{sub}</span>}
      </span>
    </span>
  );
}
