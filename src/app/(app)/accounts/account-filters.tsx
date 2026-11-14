"use client";
import { FilterBar, type FilterDef } from "@/components/crm/filter-bar";
import { useActor, useLookups } from "@/components/crm/providers";

export function AccountFilters({ owners, showDeleted }: { owners: { id: string; fullName: string }[]; showDeleted?: boolean }) {
  const L = useLookups();
  const actor = useActor();
  const filters: FilterDef[] = [
    { key: "industry", label: "Industry", options: L.industries.map((i) => ({ value: i.id, label: i.name })) },
    { key: "segment", label: "Segment", options: L.segments.map((s) => ({ value: s.id, label: s.name })) },
  ];
  if (actor.role !== "SALES" && owners.length > 1) filters.push({ key: "owner", label: "Owner", options: owners.map((o) => ({ value: o.id, label: o.fullName })) });
  if (showDeleted) filters.push({ key: "includeDeleted", label: "Deleted", options: [{ value: "true", label: "Include deleted" }] });
  return <FilterBar filters={filters} search={{ placeholder: "Search name, code, GSTIN, city…" }} />;
}
