"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, LockOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/crm/data-table";
import { FilterBar } from "@/components/crm/filter-bar";
import { NeutralPill } from "@/components/crm/pills";
import { Field, FormError, OptionSelect } from "@/components/crm/form";
import { ConfirmDialog } from "@/components/crm/dialogs";
import { useForm } from "@/client/use-form";
import { api } from "@/client/api";
import { createUserSchema, ROLE_LABEL, ROLES, updateUserSchema } from "@/contracts/users";
import { fmtDateTime } from "@/lib/format";

type Row = { id: string; fullName: string; email: string; role: (typeof ROLES)[number]; title: string | null; managerId: string | null; isActive: boolean; lockedUntil?: string | null; lastLoginAt?: string | null; mustChangePassword?: boolean };

export function UsersTable({ rows, includeInactive }: { rows: Row[]; includeInactive: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [reset, setReset] = useState<Row | null>(null);
  const [unlock, setUnlock] = useState<Row | null>(null);
  const name = new Map(rows.map((r) => [r.id, r.fullName]));
  const locked = (r: Row) => !!r.lockedUntil && new Date(r.lockedUntil) > new Date();
  const columns: Column<Row>[] = [
    { key: "name", header: "Name", cell: (r) => <button type="button" className="text-left font-medium hover:text-primary" onClick={() => setEditing(r)}>{r.fullName}{!r.isActive && <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>}</button> },
    { key: "email", header: "Email", cell: (r) => r.email, hideBelow: "md" },
    { key: "role", header: "Role", cell: (r) => <NeutralPill>{ROLE_LABEL[r.role]}</NeutralPill> },
    { key: "title", header: "Title", cell: (r) => r.title ?? "—", hideBelow: "lg" },
    { key: "manager", header: "Reports to", cell: (r) => (r.managerId ? name.get(r.managerId) ?? "—" : "—"), hideBelow: "md" },
    { key: "login", header: "Last sign-in", cell: (r) => (r.lastLoginAt ? fmtDateTime(r.lastLoginAt) : "Never"), hideBelow: "lg" },
    { key: "state", header: "", cell: (r) => <span className="flex gap-1">{locked(r) && <NeutralPill className="bg-destructive/10 text-destructive">Locked</NeutralPill>}{r.mustChangePassword && <NeutralPill>Must change password</NeutralPill>}</span> },
    { key: "actions", header: "", align: "right", cell: (r) => <span className="inline-flex gap-1">{locked(r) && <Button variant="ghost" size="icon-xs" aria-label={`Unlock ${r.fullName}`} onClick={() => setUnlock(r)}><LockOpen /></Button>}<Button variant="ghost" size="icon-xs" aria-label={`Reset password for ${r.fullName}`} onClick={() => setReset(r)}><KeyRound /></Button></span> },
  ];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterBar filters={[{ key: "includeInactive", label: "Inactive", options: [{ value: "true", label: "Show inactive" }] }]} className="mb-0" />
        <Button size="sm" onClick={() => setEditing("new")}><Plus /> New user</Button>
      </div>
      <div className="mt-4">
        <DataTable columns={columns} rows={rows} total={rows.length} empty={{ title: includeInactive ? "No users" : "No active users" }} />
      </div>
      {editing && <UserDialog key={editing === "new" ? "new" : editing.id} user={editing === "new" ? null : editing} managers={rows.filter((r) => r.isActive && (r.role === "SALES_HEAD" || r.role === "ADMIN"))} onClose={() => setEditing(null)} />}
      {reset && <ResetDialog user={reset} onClose={() => setReset(null)} />}
      <ConfirmDialog open={!!unlock} onOpenChange={(o) => !o && setUnlock(null)} title={`Unlock ${unlock?.fullName}?`} description="Clears the failed sign-in lock so they can try again." confirmLabel="Unlock" onConfirm={async () => { if (!unlock) return; await api.post(`/admin/users/${unlock.id}/unlock`); toast.success("Unlocked"); router.refresh(); }} />
    </>
  );
}

function UserDialog({ user, managers, onClose }: { user: Row | null; managers: Row[]; onClose: () => void }) {
  const router = useRouter();
  const f = useForm({ fullName: user?.fullName ?? "", email: user?.email ?? "", role: (user?.role ?? "SALES") as (typeof ROLES)[number], managerId: user?.managerId ?? null, title: user?.title ?? "", isActive: user?.isActive ?? true, temporaryPassword: "" }, user ? updateUserSchema : createUserSchema);
  const save = () =>
    f.submit(async (v) => {
      const body = { fullName: v.fullName, role: v.role, managerId: v.managerId, title: v.title || null };
      if (user) await api.patch(`/admin/users/${user.id}`, { ...body, isActive: v.isActive });
      else await api.post("/admin/users", { ...body, email: v.email, temporaryPassword: v.temporaryPassword });
      toast.success(user ? "User saved" : "User created. Share the temporary password; they must change it at first sign-in.");
      onClose();
      router.refresh();
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{user ? `Edit ${user.fullName}` : "New user"}</DialogTitle><DialogDescription>{user ? "Email can't change; create a new user instead." : "They sign in with the temporary password and must change it."}</DialogDescription></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Field label="Full name" htmlFor="u-name" error={f.errors.fullName} required><Input id="u-name" value={f.values.fullName} onChange={(e) => f.set("fullName", e.target.value)} autoFocus /></Field>
          {!user && <Field label="Email" htmlFor="u-email" error={f.errors.email} required><Input id="u-email" type="email" value={f.values.email} onChange={(e) => f.set("email", e.target.value)} /></Field>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role" htmlFor="u-role" error={f.errors.role} required><OptionSelect id="u-role" value={f.values.role} onChange={(v) => f.set("role", (v ?? "SALES") as (typeof ROLES)[number])} options={ROLES.map((r) => ({ id: r, name: ROLE_LABEL[r] }))} /></Field>
            <Field label="Reports to" htmlFor="u-manager" error={f.errors.managerId}><OptionSelect id="u-manager" value={f.values.managerId} onChange={(v) => f.set("managerId", v)} options={managers.filter((m) => m.id !== user?.id).map((m) => ({ id: m.id, name: m.fullName }))} none="Nobody" /></Field>
          </div>
          <Field label="Title" htmlFor="u-title" error={f.errors.title}><Input id="u-title" value={f.values.title} onChange={(e) => f.set("title", e.target.value)} placeholder="e.g. Regional Sales Manager" /></Field>
          {!user && <Field label="Temporary password" htmlFor="u-pw" error={f.errors.temporaryPassword} required hint="At least 10 characters with a letter and a number."><Input id="u-pw" type="text" value={f.values.temporaryPassword} onChange={(e) => f.set("temporaryPassword", e.target.value)} autoComplete="off" /></Field>}
          {user && (
            <div className="flex items-center gap-2"><Switch id="u-active" checked={f.values.isActive} onCheckedChange={(v) => f.set("isActive", v)} /><label htmlFor="u-active" className="text-sm">Active (can sign in)</label></div>
          )}
          <FormError message={f.formError && !Object.keys(f.errors).length ? f.formError : null} />
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={f.pending}>{user ? "Save" : "Create user"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetDialog({ user, onClose }: { user: Row; onClose: () => void }) {
  const f = useForm({ temporaryPassword: "" });
  const save = () =>
    f.submit(async (v) => {
      if (v.temporaryPassword.length < 10) return f.setErrors({ temporaryPassword: "At least 10 characters." });
      await api.post(`/admin/users/${user.id}/reset-password`, { temporaryPassword: v.temporaryPassword });
      toast.success("Password reset. Their other sessions are signed out.");
      onClose();
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reset password for {user.fullName}</DialogTitle><DialogDescription>Set a temporary password and share it with them. They must change it at the next sign-in.</DialogDescription></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Field label="Temporary password" htmlFor="rp-pw" error={f.errors.temporaryPassword} required><Input id="rp-pw" type="text" value={f.values.temporaryPassword} onChange={(e) => f.set("temporaryPassword", e.target.value)} autoComplete="off" autoFocus /></Field>
          <FormError message={f.formError && !Object.keys(f.errors).length ? f.formError : null} />
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={f.pending}>Reset password</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
