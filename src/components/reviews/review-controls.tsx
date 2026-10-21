"use client";
import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, Textarea, Field } from "@/components/ui/input";
import { useAction } from "@/components/crm/use-action";
import { markReviewed } from "@/server/actions/reviews";

export function SinceSelect({ reviews }: { reviews: { id: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <Select
      value={sp.get("since") ?? ""}
      onChange={(e) => {
        const next = new URLSearchParams(sp.toString());
        if (e.target.value) next.set("since", e.target.value);
        else next.delete("since");
        router.replace(`${pathname}?${next.toString()}`);
      }}
      className="w-64"
      aria-label="Compare against"
    >
      <option value="">Since my last review</option>
      <option value="7d">Last 7 days</option>
      <option value="30d">Last 30 days</option>
      {reviews.map((r) => <option key={r.id} value={r.id}>Since review on {r.label}</option>)}
    </Select>
  );
}

export function MarkReviewedButton({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const router = useRouter();
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary"><CheckCheck /> Mark as reviewed</Button>
      </DialogTrigger>
      <DialogContent title="Close this pipeline review" description={`Sets a new baseline. The ${count} changes shown here will no longer appear as new.`}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => markReviewed(notes), { success: "Review recorded", onOk: () => { setOpen(false); router.replace("/reviews"); } });
          }}
        >
          <Field label="Review notes and actions agreed">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Chirag to re-engage RVVNL CIO; escalate Medisure pricing to Purchase head" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>Record review</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
