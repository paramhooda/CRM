"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Check, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/crm/pills";
import { ReasonDialog, ConfirmDialog } from "@/components/crm/dialogs";
import { useActor } from "@/components/crm/providers";
import { api, errorMessage } from "@/client/api";
import { fmtDate } from "@/lib/format";
import { isOpen, type ApprovalState, type Stage } from "@/domain/stages";
import { cn } from "@/lib/utils";

type Step = { stepNo: number; label: string; approvers: { id: string; fullName: string }[]; decision: string | null; decidedByName: string | null; decidedAt: Date | string | null; note: string | null; autoPassed: boolean; current: boolean };
type Approval = { id: string; status: string; requestedAt: Date | string; requestedBy: { fullName: string }; reasons: string[]; currentStep: number; steps: Step[] };

const STATE_TEXT: Record<ApprovalState, { label: string; tone: string; text: string }> = {
  NONE_NEEDED: { label: "Not needed", tone: "text-muted-foreground", text: "These prices don't match any approval rule." },
  NEEDED: { label: "Needed", tone: "text-warning", text: "Ask for approval before the proposal goes out." },
  PENDING: { label: "Pending", tone: "text-warning", text: "Waiting for the approvers." },
  APPROVED: { label: "Approved", tone: "text-success", text: "The current prices are approved." },
  REJECTED: { label: "Rejected", tone: "text-destructive", text: "Change the prices and ask again." },
  STALE: { label: "Prices changed", tone: "text-warning", text: "The lines changed since the last approval; ask again." },
};

export function ApprovalCard({ dealId, stage, state, reasons, approvals, canEdit }: { dealId: string; stage: string; state: ApprovalState; reasons: string[]; approvals: Approval[]; canEdit: boolean }) {
  const actor = useActor();
  const router = useRouter();
  const [decide, setDecide] = useState<{ id: string; decision: "APPROVED" | "REJECTED" } | null>(null);
  const [asking, setAsking] = useState(false);
  const latest = approvals[0];
  const s = STATE_TEXT[state];
  const canAsk = canEdit && (state === "NEEDED" || state === "STALE" || state === "REJECTED") && isOpen(stage as Stage);
  const myStep = latest?.status === "PENDING" ? latest.steps.find((st) => st.current && st.approvers.some((a) => a.id === actor.id)) : undefined;
  const request = async () => {
    setAsking(true);
    try {
      const r = await api.post<{ approval: { status: string } }>(`/deals/${dealId}/approvals`);
      toast.success(r.approval.status === "APPROVED" ? "Approved: no other approver was needed" : "Approval requested");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setAsking(false);
    }
  };
  return (
    <section id="approval" className="scroll-mt-24 rounded-xl border border-border bg-card p-4" aria-label="Approval">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="size-4 text-muted-foreground" /> Price approval</h2>
        <span className={cn("text-xs font-medium", s.tone)}>{s.label}</span>
      </div>
      <p className="text-sm text-muted-foreground">{s.text}</p>
      {reasons.length > 0 && state !== "NONE_NEEDED" && <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      {canAsk && <Button size="sm" className="mt-3" onClick={request} disabled={asking}>Ask for approval</Button>}
      {latest && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><StatusPill status={latest.status} /> Requested by {latest.requestedBy.fullName} on {fmtDate(latest.requestedAt)}</div>
          <ol className="mt-2 flex flex-col gap-1.5">
            {latest.steps.map((st) => (
              <li key={st.stepNo} className={cn("flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 text-sm", st.current && "bg-stage-proposal/40")}>
                <span className="text-xs text-muted-foreground">{st.stepNo}.</span>
                <span className="font-medium">{st.label}</span>
                <span className="text-xs text-muted-foreground">{st.approvers.map((a) => a.fullName).join(", ") || "—"}</span>
                <span className="ml-auto text-xs">
                  {st.decision === "APPROVED" && <span className="inline-flex items-center gap-1 text-success"><Check className="size-3" /> {st.autoPassed ? "Auto" : st.decidedByName}{st.decidedAt ? ` · ${fmtDate(st.decidedAt)}` : ""}</span>}
                  {st.decision === "REJECTED" && <span className="inline-flex items-center gap-1 text-destructive"><X className="size-3" /> {st.decidedByName}</span>}
                  {!st.decision && st.current && latest.status === "PENDING" && <span className="text-warning">Waiting</span>}
                </span>
                {st.note && <span className="basis-full text-xs text-muted-foreground">“{st.note}”</span>}
              </li>
            ))}
          </ol>
          {myStep && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => setDecide({ id: latest.id, decision: "APPROVED" })}><Check /> Approve</Button>
              <Button size="sm" variant="outline" onClick={() => setDecide({ id: latest.id, decision: "REJECTED" })}><X /> Reject</Button>
            </div>
          )}
        </div>
      )}
      {decide?.decision === "APPROVED" && <ConfirmDialog open onOpenChange={(o) => !o && setDecide(null)} title="Approve these prices?" description="Your decision is recorded with your name." confirmLabel="Approve" onConfirm={async () => { await api.post(`/approvals/${decide.id}/decide`, { decision: "APPROVED" }); toast.success("Approved"); router.refresh(); }} />}
      {decide?.decision === "REJECTED" && <ReasonDialog open onOpenChange={(o) => !o && setDecide(null)} title="Reject these prices" description="Sales sees your note and can change the prices and ask again." confirmLabel="Reject" destructive label="Why" onConfirm={async (note) => { await api.post(`/approvals/${decide.id}/decide`, { decision: "REJECTED", note }); toast.success("Rejected"); router.refresh(); }} />}
    </section>
  );
}
