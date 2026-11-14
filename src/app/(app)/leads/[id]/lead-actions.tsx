"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ArrowRightCircle, MoreHorizontal, Pencil, RotateCcw, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ConfirmDialog, ReasonDialog } from "@/components/crm/dialogs";
import { Field, FormError, OptionSelect } from "@/components/crm/form";
import { Combobox } from "@/components/crm/combobox";
import { useLookups } from "@/components/crm/providers";
import { FORECAST_LABEL } from "@/components/crm/pills";
import { useForm } from "@/client/use-form";
import { api } from "@/client/api";
import { isoDay } from "@/lib/format";

type Props = { id: string; status: string; canEdit: boolean; companyName: string; contactName: string; contactEmail: string | null; contactPhone: string | null; designation: string | null; notes: string | null; canDelete: boolean; canRestore: boolean };

export function LeadActions(p: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"disqualify" | "convert" | "delete" | "restore" | null>(null);
  const setStatus = async (status: "NEW" | "CONTACTED" | "QUALIFIED") => {
    await api.patch(`/leads/${p.id}`, { status });
    toast.success(`Marked ${status.toLowerCase()}`);
    router.refresh();
  };
  const open = p.status !== "CONVERTED" && p.status !== "DISQUALIFIED";
  return (
    <>
      {p.canEdit && open && (
        <>
          {p.status === "NEW" && <Button size="sm" variant="outline" onClick={() => setStatus("CONTACTED")}>Mark contacted</Button>}
          {p.status !== "QUALIFIED" && <Button size="sm" variant="outline" onClick={() => setStatus("QUALIFIED")}>Mark qualified</Button>}
          <Button size="sm" onClick={() => setDialog("convert")}><ArrowRightCircle /> Convert to deal</Button>
        </>
      )}
      {(p.canEdit || p.canDelete || p.canRestore) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="icon-sm" aria-label="More actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {p.canEdit && <DropdownMenuItem asChild><Link href={`/leads/${p.id}?edit=1`}><Pencil /> Edit lead</Link></DropdownMenuItem>}
            {p.canEdit && open && <DropdownMenuItem onClick={() => setDialog("disqualify")}><XCircle /> Disqualify</DropdownMenuItem>}
            {(p.canDelete || p.canRestore) && <DropdownMenuSeparator />}
            {p.canDelete && <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}><Trash2 /> Delete lead</DropdownMenuItem>}
            {p.canRestore && <DropdownMenuItem onClick={() => setDialog("restore")}><RotateCcw /> Restore lead</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ReasonDialog open={dialog === "disqualify"} onOpenChange={(o) => !o && setDialog(null)} title="Disqualify this lead" description="It stays on record with the reason." placeholder="No budget, not a fit, went elsewhere…" confirmLabel="Disqualify" destructive onConfirm={async (reason) => { await api.post(`/leads/${p.id}/disqualify`, { reason }); toast.success("Lead disqualified"); router.refresh(); }} />
      <ConfirmDialog open={dialog === "delete"} onOpenChange={(o) => !o && setDialog(null)} title="Delete this lead?" description="An administrator can restore it." destructive confirmLabel="Delete" onConfirm={async () => { await api.del(`/leads/${p.id}`); toast.success("Lead deleted"); router.push("/leads"); router.refresh(); }} />
      <ConfirmDialog open={dialog === "restore"} onOpenChange={(o) => !o && setDialog(null)} title="Restore this lead?" confirmLabel="Restore" onConfirm={async () => { await api.post(`/leads/${p.id}/restore`); toast.success("Lead restored"); router.refresh(); }} />
      {dialog === "convert" && <ConvertDialog lead={p} onClose={() => setDialog(null)} />}
    </>
  );
}

function ConvertDialog({ lead, onClose }: { lead: Props; onClose: () => void }) {
  const router = useRouter();
  const L = useLookups();
  const [first, ...rest] = lead.contactName.split(" ");
  const [defaultClose] = useState(() => isoDay(new Date(Date.now() + 60 * 86_400_000)));
  const f = useForm({
    accountMode: "create" as "create" | "existing", accountId: null as string | null, accountName: lead.companyName,
    contactMode: "create" as "create" | "existing", contactId: null as string | null, firstName: first ?? "", lastName: rest.join(" ") || "-", email: lead.contactEmail ?? "", phone: lead.contactPhone ?? "", designation: lead.designation ?? "",
    dealName: `${lead.companyName} opportunity`, expectedCloseDate: defaultClose, forecastCategory: "PIPELINE" as "COMMIT" | "UPSIDE" | "PIPELINE", needsPresales: null as boolean | null,
  });
  const [contacts, setContacts] = useState<{ value: string; label: string; hint?: string }[]>([]);
  const loadAccounts = useCallback(async (q: string) => {
    const r = await api.get<{ rows: { id: string; name: string; code: string }[] }>(`/accounts?q=${encodeURIComponent(q)}&pageSize=20`);
    return r.rows.map((a) => ({ value: a.id, label: a.name, hint: a.code }));
  }, []);
  const pickAccount = async (id: string | null) => {
    f.set("accountId", id);
    if (!id) return setContacts([]);
    const a = await api.get<{ contacts: { id: string; firstName: string; lastName: string; designation: string | null }[] }>(`/accounts/${id}`);
    setContacts(a.contacts.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}`, hint: c.designation ?? undefined })));
  };
  const convert = () =>
    f.submit(async (v) => {
      const body = {
        account: v.accountMode === "existing" ? { existingId: v.accountId } : { create: { name: v.accountName } },
        contact: v.contactMode === "existing" ? { existingId: v.contactId } : { create: { firstName: v.firstName, lastName: v.lastName, email: v.email || null, phone: v.phone || null, designation: v.designation || null } },
        deal: { name: v.dealName, expectedCloseDate: v.expectedCloseDate, forecastCategory: v.forecastCategory, needsPresales: v.needsPresales ?? undefined, description: lead.notes },
      };
      const r = await api.post<{ dealId: string }>(`/leads/${lead.id}/convert`, body);
      toast.success("Lead converted");
      router.push(`/deals/${r.dealId}`);
      router.refresh();
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Convert to a deal</DialogTitle>
          <DialogDescription>Creates the account and contact (or picks existing ones) and a deal at Qualified. A lead converts once.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void convert(); }}>
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Account</h3>
              <ToggleGroup type="single" size="sm" variant="outline" value={f.values.accountMode} onValueChange={(v) => v && f.set("accountMode", v as "create" | "existing")}>
                <ToggleGroupItem value="create">New account</ToggleGroupItem>
                <ToggleGroupItem value="existing">Existing</ToggleGroupItem>
              </ToggleGroup>
            </div>
            {f.values.accountMode === "create" ? (
              <Field label="Account name" htmlFor="accountName" error={f.errors["account.create.name"] ?? f.errors.accountName} required><Input id="accountName" value={f.values.accountName} onChange={(e) => f.set("accountName", e.target.value)} /></Field>
            ) : (
              <Field label="Account" htmlFor="accountPick" error={f.errors["account.existingId"]} required><Combobox id="accountPick" value={f.values.accountId} onChange={(v) => void pickAccount(v)} load={loadAccounts} placeholder="Pick an account" searchPlaceholder="Search accounts…" /></Field>
            )}
          </section>
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Contact</h3>
              <ToggleGroup type="single" size="sm" variant="outline" value={f.values.contactMode} onValueChange={(v) => v && f.set("contactMode", v as "create" | "existing")}>
                <ToggleGroupItem value="create">New contact</ToggleGroupItem>
                <ToggleGroupItem value="existing" disabled={f.values.accountMode !== "existing"}>Existing</ToggleGroupItem>
              </ToggleGroup>
            </div>
            {f.values.contactMode === "existing" && f.values.accountMode === "existing" ? (
              <Field label="Contact" htmlFor="contactPick" error={f.errors["contact.existingId"]} required><Combobox id="contactPick" value={f.values.contactId} onChange={(v) => f.set("contactId", v)} options={contacts} placeholder={contacts.length ? "Pick a contact" : "No contacts at this account"} /></Field>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First name" htmlFor="cfirst" error={f.errors["contact.create.firstName"]} required><Input id="cfirst" value={f.values.firstName} onChange={(e) => f.set("firstName", e.target.value)} /></Field>
                <Field label="Last name" htmlFor="clast" error={f.errors["contact.create.lastName"]} required><Input id="clast" value={f.values.lastName} onChange={(e) => f.set("lastName", e.target.value)} /></Field>
                <Field label="Email" htmlFor="cemail" error={f.errors["contact.create.email"]}><Input id="cemail" type="email" value={f.values.email} onChange={(e) => f.set("email", e.target.value)} /></Field>
                <Field label="Designation" htmlFor="cdesig"><Input id="cdesig" value={f.values.designation} onChange={(e) => f.set("designation", e.target.value)} /></Field>
              </div>
            )}
          </section>
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">Deal</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Deal name" htmlFor="dealName" error={f.errors["deal.name"]} required className="sm:col-span-2"><Input id="dealName" value={f.values.dealName} onChange={(e) => f.set("dealName", e.target.value)} /></Field>
              <Field label="Expected close" htmlFor="close" error={f.errors["deal.expectedCloseDate"]} required><Input id="close" type="date" value={f.values.expectedCloseDate} onChange={(e) => f.set("expectedCloseDate", e.target.value)} /></Field>
              <Field label="Forecast" htmlFor="forecast"><OptionSelect id="forecast" value={f.values.forecastCategory} onChange={(v) => f.set("forecastCategory", (v ?? "PIPELINE") as "COMMIT" | "UPSIDE" | "PIPELINE")} options={L.forecasts.map((x) => ({ id: x.key, name: FORECAST_LABEL[x.key] }))} /></Field>
            </div>
          </section>
          <FormError message={f.formError && !Object.keys(f.errors).length ? f.formError : null} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={f.pending}>Convert</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
