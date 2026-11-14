"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/crm/dialogs";
import { api } from "@/client/api";

export function AccountActions({ id, name, openDeals, canDelete, canRestore }: { id: string; name: string; openDeals: number; canDelete: boolean; canRestore: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"delete" | "restore" | null>(null);
  if (!canDelete && !canRestore) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="outline" size="icon-sm" aria-label="More actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canDelete && <DropdownMenuItem variant="destructive" onClick={() => setConfirm("delete")}><Trash2 /> Delete account</DropdownMenuItem>}
          {canRestore && <DropdownMenuItem onClick={() => setConfirm("restore")}><RotateCcw /> Restore account</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm === "delete"} onOpenChange={(o) => !o && setConfirm(null)} title={`Delete ${name}?`} destructive confirmLabel="Delete"
        description={openDeals ? `This account has ${openDeals} deal${openDeals > 1 ? "s" : ""}; move or delete them first.` : "The account and its contacts are hidden. An administrator can restore it."}
        onConfirm={async () => { await api.del(`/accounts/${id}`); toast.success("Account deleted"); router.push("/accounts"); router.refresh(); }}
      />
      <ConfirmDialog open={confirm === "restore"} onOpenChange={(o) => !o && setConfirm(null)} title={`Restore ${name}?`} confirmLabel="Restore" onConfirm={async () => { await api.post(`/accounts/${id}/restore`); toast.success("Account restored"); router.refresh(); }} />
    </>
  );
}
