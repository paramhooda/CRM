"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/crm/states";
import { api, errorMessage } from "@/client/api";
import { fyLabel } from "@/domain/fiscal";
import { inr } from "@/lib/format";
import { queryString } from "@/lib/url-state";

type Row = { userId: string; quarter: number; targetValue: string };

export function TargetsGrid({ fiscalYear, years, people, rows, canEdit }: { fiscalYear: number; years: number[]; people: { id: string; fullName: string }[]; rows: Row[]; canEdit: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initial: Record<string, string> = {};
  for (const r of rows) initial[`${r.userId}:${r.quarter}`] = r.targetValue.replace(/\.00$/, "");
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const key = (u: string, q: number) => `${u}:${q}`;
  const dirty = Object.keys(values).some((k) => (values[k] ?? "") !== (initial[k] ?? ""));
  const save = async () => {
    const changed = Object.entries(values).filter(([k, v]) => v !== (initial[k] ?? "") && v !== "");
    const bad = changed.find(([, v]) => !/^\d+(\.\d{1,2})?$/.test(v));
    if (bad) return toast.error("Targets are plain amounts in rupees, e.g. 25000000.");
    setPending(true);
    try {
      await api.put("/targets", { rows: changed.map(([k, v]) => ({ userId: k.split(":")[0], fiscalYear, quarter: Number(k.split(":")[1]), targetValue: v })) });
      toast.success("Targets saved");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  const total = (u: string) => [1, 2, 3, 4].reduce((s, q) => s + (Number(values[key(u, q)]) || 0), 0);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Select value={String(fiscalYear)} onValueChange={(v) => router.replace(`${pathname}${queryString(params, { fy: v })}`)}>
          <SelectTrigger className="w-32" aria-label="Fiscal year"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{fyLabel(y)}</SelectItem>)}</SelectContent>
        </Select>
        {canEdit && <Button onClick={save} disabled={!dirty || pending}>Save targets</Button>}
      </div>
      {people.length === 0 ? (
        <EmptyState title="No sales people in your team" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr><th className="px-3 py-2 font-medium">Sales person</th>{[1, 2, 3, 4].map((q) => <th key={q} className="px-3 py-2 text-right font-medium">Q{q}</th>)}<th className="px-3 py-2 text-right font-medium">Year</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {people.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{p.fullName}</td>
                    {[1, 2, 3, 4].map((q) => (
                      <td key={q} className="px-3 py-1.5 text-right">
                        {canEdit ? <Input inputMode="decimal" aria-label={`${p.fullName} Q${q}`} className="ml-auto w-36 text-right tabular" value={values[key(p.id, q)] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [key(p.id, q)]: e.target.value }))} placeholder="0" /> : <span className="tabular">{inr(values[key(p.id, q)] || 0)}</span>}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular">{inr(total(p.id))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
