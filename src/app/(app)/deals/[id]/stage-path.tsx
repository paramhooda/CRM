import { Check } from "lucide-react";
import { STAGE_META, pathFor, type Stage } from "@/domain/stages";
import { cn } from "@/lib/utils";

const DONE: Record<string, string> = { QUALIFIED: "bg-stage-qualified-foreground", BOQ: "bg-stage-boq-foreground", PROPOSAL_SUBMITTED: "bg-stage-proposal-foreground", NEGOTIATION: "bg-stage-negotiation-foreground", CLOSED_WON: "bg-stage-won-foreground" };
const CURRENT: Record<string, string> = { QUALIFIED: "bg-stage-qualified text-stage-qualified-foreground ring-stage-qualified-foreground", BOQ: "bg-stage-boq text-stage-boq-foreground ring-stage-boq-foreground", PROPOSAL_SUBMITTED: "bg-stage-proposal text-stage-proposal-foreground ring-stage-proposal-foreground", NEGOTIATION: "bg-stage-negotiation text-stage-negotiation-foreground ring-stage-negotiation-foreground", CLOSED_WON: "bg-stage-won text-stage-won-foreground ring-stage-won-foreground" };

/** The deal's path through the stages: done, current, ahead. Hold, Lost and Dropped sit beside it. */
export function StagePath({ stage, needsPresales, heldFromStage, lastOpenStage }: { stage: Stage; needsPresales: boolean; heldFromStage: Stage | null; lastOpenStage: Stage | null }) {
  const path = pathFor(needsPresales);
  const anchor: Stage = stage === "HOLD" ? heldFromStage ?? "QUALIFIED" : stage === "CLOSED_LOST" || stage === "DROPPED" ? lastOpenStage ?? "QUALIFIED" : stage;
  const idx = path.indexOf(anchor);
  const side = stage === "HOLD" ? { label: "On hold", cls: "bg-stage-hold text-stage-hold-foreground" } : stage === "CLOSED_LOST" ? { label: "Closed-Lost", cls: "bg-stage-lost text-stage-lost-foreground" } : stage === "DROPPED" ? { label: "Dropped", cls: "bg-stage-dropped text-stage-dropped-foreground" } : null;
  return (
    <ol className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3" aria-label="Stage path">
      {path.map((s, i) => {
        const done = i < idx || stage === "CLOSED_WON";
        const current = !side && i === idx;
        return (
          <li key={s} className="flex items-center gap-2">
            <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium", done ? cn("text-white", DONE[s]) : current ? cn("ring-2 ring-inset", CURRENT[s]) : side && i === idx ? "bg-muted text-foreground ring-1 ring-inset ring-border" : "bg-muted text-muted-foreground")} aria-current={current ? "step" : undefined}>
              {done && <Check className="size-3" />}
              {STAGE_META[s].label}
            </span>
            {i < path.length - 1 && <span className="h-px w-3 bg-border" aria-hidden />}
          </li>
        );
      })}
      {side && <li className={cn("ml-auto inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold", side.cls)}>{side.label}{stage !== "HOLD" ? "" : ` (from ${STAGE_META[anchor].label})`}</li>}
    </ol>
  );
}
