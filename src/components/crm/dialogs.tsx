"use client";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/client/api";

/** "Are you sure?" for anything hard to undo. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirm", destructive, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode; confirmLabel?: string; destructive?: boolean; onConfirm: () => Promise<void> | void }) {
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={async (e) => {
              e.preventDefault();
              setPending(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                setPending(false);
              }
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** A dialog that asks for a reason (hold, back, reopen, disqualify) before doing something. */
export function ReasonDialog({ open, onOpenChange, title, description, label = "Reason", placeholder, confirmLabel = "Confirm", destructive, onConfirm, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode; label?: string; placeholder?: string; confirmLabel?: string; destructive?: boolean; onConfirm: (reason: string) => Promise<void> | void; children?: ReactNode }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setReason(""); setError(null); } onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (reason.trim().length < 3) return setError("Give a reason (at least a few words).");
            setPending(true);
            setError(null);
            try {
              await onConfirm(reason.trim());
              onOpenChange(false);
              setReason("");
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setPending(false);
            }
          }}
        >
          {children}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">{label}</Label>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} rows={3} aria-invalid={!!error} autoFocus />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>{confirmLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
