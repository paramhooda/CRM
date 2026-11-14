"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAiEnabled } from "@/components/crm/providers";
import { api, errorMessage } from "@/client/api";
import { LoadingState } from "@/components/crm/states";
import Link from "next/link";
import { useActor } from "@/components/crm/providers";

/** "Brief": a plain-English read of the deal for a pipeline call. Sales roles only, and only when AI is on. */
export function DealBrief({ dealId }: { dealId: string }) {
  const enabled = useAiEnabled();
  const actor = useActor();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!enabled) return actor.role === "ADMIN" ? <Button asChild size="sm" variant="ghost" className="text-muted-foreground"><Link href="/admin/settings"><Sparkles /> Set up the assistant</Link></Button> : null;
  const run = async () => {
    setOpen(true);
    setText(null);
    setError(null);
    try {
      setText((await api.post<{ text: string }>(`/deals/${dealId}/ai`, { kind: "brief" })).text);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <>
      <Button size="sm" variant="outline" onClick={run}><Sparkles /> Brief</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Deal brief</DialogTitle><DialogDescription>Written from the deal&apos;s data for a pipeline call. Check it before you rely on it.</DialogDescription></DialogHeader>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : text ? <p className="whitespace-pre-line text-sm leading-6" data-slot="brief">{text}</p> : <LoadingState rows={4} />}
          <DialogFooter>
            {text && <Button type="button" variant="outline" onClick={async () => { await navigator.clipboard.writeText(text); toast.success("Copied"); }}><Copy /> Copy</Button>}
            <Button type="button" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
