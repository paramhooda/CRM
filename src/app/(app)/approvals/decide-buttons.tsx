"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, ReasonDialog } from "@/components/crm/dialogs";
import { api } from "@/client/api";

export function DecideButtons({ id }: { id: string }) {
  const router = useRouter();
  const [which, setWhich] = useState<"APPROVED" | "REJECTED" | null>(null);
  return (
    <div className="flex gap-1.5">
      <Button size="sm" onClick={() => setWhich("APPROVED")}><Check /> Approve</Button>
      <Button size="sm" variant="outline" onClick={() => setWhich("REJECTED")}><X /> Reject</Button>
      <ConfirmDialog open={which === "APPROVED"} onOpenChange={(o) => !o && setWhich(null)} title="Approve these prices?" confirmLabel="Approve" onConfirm={async () => { await api.post(`/approvals/${id}/decide`, { decision: "APPROVED" }); toast.success("Approved"); router.refresh(); }} />
      <ReasonDialog open={which === "REJECTED"} onOpenChange={(o) => !o && setWhich(null)} title="Reject these prices" label="Why" confirmLabel="Reject" destructive onConfirm={async (note) => { await api.post(`/approvals/${id}/decide`, { decision: "REJECTED", note }); toast.success("Rejected"); router.refresh(); }} />
    </div>
  );
}
