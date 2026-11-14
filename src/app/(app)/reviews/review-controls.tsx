"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActor } from "@/components/crm/providers";
import { queryString } from "@/lib/url-state";

const SINCE = [
  { key: "last", label: "Since the last review" },
  { key: "7d", label: "Last 7 days" },
  { key: "14d", label: "Last 14 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "qtd", label: "This quarter" },
];

export function ReviewControls({ people, scope }: { people: { id: string; fullName: string; role: string }[]; scope: "rep" | "team" | "everyone" }) {
  const actor = useActor();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const since = params.get("since") ?? "last";
  const scopeUser = params.get("scope_user_id") ?? "";
  const set = (patch: Record<string, string | null>) => router.replace(`${pathname}${queryString(params, patch)}`, { scroll: false });
  const reps = people.filter((p) => p.role === "SALES");
  const heads = people.filter((p) => p.role === "SALES_HEAD");
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      {actor.role !== "SALES" && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Scope</Label>
          <Select value={scope} onValueChange={(v) => set({ scope: v, scope_user_id: null })}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="everyone">Everyone I see</SelectItem>
              <SelectItem value="team">A team</SelectItem>
              <SelectItem value="rep">One person</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {scope === "rep" && actor.role !== "SALES" && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Person</Label>
          <Select value={scopeUser} onValueChange={(v) => set({ scope_user_id: v })}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Pick a sales person" /></SelectTrigger>
            <SelectContent>{reps.map((p) => <SelectItem key={p.id} value={p.id}>{p.fullName}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      {scope === "team" && heads.length > 0 && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Team of</Label>
          <Select value={scopeUser || "__me"} onValueChange={(v) => set({ scope_user_id: v === "__me" ? null : v })}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__me">My team</SelectItem>
              {heads.filter((h) => h.id !== actor.id).map((p) => <SelectItem key={p.id} value={p.id}>{p.fullName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Window</Label>
        <Select value={since} onValueChange={(v) => set({ since: v })}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>{SINCE.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
  );
}
