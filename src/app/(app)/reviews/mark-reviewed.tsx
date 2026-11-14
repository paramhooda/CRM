"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/client/api";

/** Records that the review happened; the next "since the last review" window starts here. */
export function MarkReviewed({ scope, scopeUserId, since, people }: { scope: "rep" | "team" | "everyone"; scopeUserId: string | null; since: string; people: number }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const done = async () => {
    setPending(true);
    try {
      await api.post("/reviews", { scope, scopeUserId, sinceDate: since, notes: notes || null });
      toast.success("Review recorded");
      setNotes("");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-4" aria-label="Mark reviewed">
      <Label htmlFor="review-notes" className="text-sm font-semibold">Review notes</Label>
      <p className="mb-2 text-xs text-muted-foreground">Decisions and asks from this review. Marking it reviewed starts the next window for {people === 1 ? "this person" : `these ${people} people`}.</p>
      <Textarea id="review-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Push Konark Logistics to Negotiation by Friday; drop stale Qualified deals older than 120 days" />
      <div className="mt-3 flex justify-end"><Button onClick={done} disabled={pending || people === 0}><CheckCircle2 /> Mark reviewed</Button></div>
    </section>
  );
}
