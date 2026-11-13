"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, RotateCcw, Trash2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/crm/dialogs";
import { Field, FormError, OptionSelect } from "@/components/crm/form";
import { useActor } from "@/components/crm/providers";
import { useForm } from "@/client/use-form";
import { api } from "@/client/api";
import { can } from "@/domain/permissions";
import { isManagerRole } from "@/domain/scope";

type Person = { id: string; fullName: string };
type DealRef = { id: string; name: string; version: number; ownerId: string; presalesOwnerId: string | null; deleted: boolean; canEdit: boolean; stage: string };

export function DealMenu({ deal, owners, presalesPeople }: { deal: DealRef; owners: Person[]; presalesPeople: Person[] }) {
  const actor = useActor();
  const router = useRouter();
  const [dialog, setDialog] = useState<"reassign" | "delete" | "restore" | null>(null);
  const manager = isManagerRole(actor.role);
  const canDelete = can(actor.role, "deals.delete") && !deal.deleted && (manager || actor.id === deal.ownerId);
  const canRestore = can(actor.role, "records.restore") && deal.deleted;
  const canReassign = deal.canEdit && (manager || actor.role === "SALES");
  if (!deal.canEdit && !canDelete && !canRestore) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="outline" size="icon-sm" aria-label="More actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {deal.canEdit && <DropdownMenuItem asChild><Link href={`/deals/${deal.id}/edit`}><Pencil /> Edit details</Link></DropdownMenuItem>}
          {canReassign && <DropdownMenuItem onClick={() => setDialog("reassign")}><UserCog /> {manager ? "Reassign owner / presales" : "Set presales owner"}</DropdownMenuItem>}
          {(canDelete || canRestore) && <DropdownMenuSeparator />}
          {canDelete && <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}><Trash2 /> Delete deal</DropdownMenuItem>}
          {canRestore && <DropdownMenuItem onClick={() => setDialog("restore")}><RotateCcw /> Restore deal</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog open={dialog === "delete"} onOpenChange={(o) => !o && setDialog(null)} title={`Delete ${deal.name}?`} description="The deal is hidden from lists and totals. An administrator can restore it." destructive confirmLabel="Delete" onConfirm={async () => { await api.del(`/deals/${deal.id}`); toast.success("Deal deleted"); router.push("/deals"); router.refresh(); }} />
      <ConfirmDialog open={dialog === "restore"} onOpenChange={(o) => !o && setDialog(null)} title={`Restore ${deal.name}?`} confirmLabel="Restore" onConfirm={async () => { await api.post(`/deals/${deal.id}/restore`); toast.success("Deal restored"); router.refresh(); }} />
      {dialog === "reassign" && <ReassignDialog deal={deal} owners={owners} presalesPeople={presalesPeople} manager={manager} onClose={() => setDialog(null)} />}
    </>
  );
}

function ReassignDialog({ deal, owners, presalesPeople, manager, onClose }: { deal: DealRef; owners: Person[]; presalesPeople: Person[]; manager: boolean; onClose: () => void }) {
  const router = useRouter();
  const f = useForm({ ownerId: deal.ownerId as string | null, presalesOwnerId: deal.presalesOwnerId });
  const save = () =>
    f.submit(async (v) => {
      await api.post(`/deals/${deal.id}/reassign`, { ...(manager && v.ownerId && v.ownerId !== deal.ownerId ? { ownerId: v.ownerId } : {}), presalesOwnerId: v.presalesOwnerId });
      toast.success("Deal reassigned");
      onClose();
      router.refresh();
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reassign</DialogTitle>
          <DialogDescription>{manager ? "Change who owns the deal and who leads presales on it." : "Pick the presales engineer who leads this deal."}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {manager && (
            <Field label="Owner" htmlFor="rs-owner" error={f.errors.ownerId}><OptionSelect id="rs-owner" value={f.values.ownerId} onChange={(v) => f.set("ownerId", v)} options={owners.map((o) => ({ id: o.id, name: o.fullName }))} /></Field>
          )}
          <Field label="Presales owner" htmlFor="rs-presales" error={f.errors.presalesOwnerId}><OptionSelect id="rs-presales" value={f.values.presalesOwnerId} onChange={(v) => f.set("presalesOwnerId", v)} options={presalesPeople.map((o) => ({ id: o.id, name: o.fullName }))} none="None" /></Field>
          <FormError message={f.formError && !Object.keys(f.errors).length ? f.formError : null} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={f.pending}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
