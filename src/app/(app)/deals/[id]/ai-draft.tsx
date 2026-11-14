"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAiEnabled } from "@/components/crm/providers";
import { api, errorMessage } from "@/client/api";

export type DraftKind = "scope" | "boq_summary" | "brief" | "email";

/** "Draft with AI": fills a text field from the deal's data. Rendered only when the server has an AI key. */
export function AiDraftButton({ dealId, kind, onDraft, label = "Draft with AI" }: { dealId: string; kind: DraftKind; onDraft: (text: string) => void; label?: string }) {
  const enabled = useAiEnabled();
  const [pending, setPending] = useState(false);
  if (!enabled) return null;
  const run = async () => {
    setPending(true);
    try {
      const r = await api.post<{ text: string }>(`/deals/${dealId}/ai`, { kind });
      onDraft(r.text);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="-mt-2 flex items-center gap-2">
      <Button type="button" size="xs" variant="ghost" onClick={run} disabled={pending}><Sparkles /> {pending ? "Drafting…" : label}</Button>
      <span className="text-xs text-muted-foreground">A starting point from the deal&apos;s data; read it before you send.</span>
    </div>
  );
}
