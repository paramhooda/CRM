"use client";
import { FilterBar, type FilterDef } from "@/components/crm/filter-bar";
import { useActor, useLookups } from "@/components/crm/providers";
import { STATUS_LABEL } from "@/components/crm/pills";
import { LEAD_STATUSES } from "@/contracts/leads";

export function LeadFilters({ owners, showDeleted }: { owners: { id: string; fullName: string }[]; showDeleted?: boolean }) {
  const L = useLookups();
  const actor = useActor();
  const filters: FilterDef[] = [
    { key: "status", label: "Status", options: LEAD_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s]! })) },
    { key: "source", label: "Source", options: L.leadSources.map((s) => ({ value: s.id, label: s.name })) },
  ];
  if (actor.role !== "SALES" && owners.length > 1) filters.push({ key: "owner", label: "Owner", options: owners.map((o) => ({ value: o.id, label: o.fullName })) });
  if (showDeleted) filters.push({ key: "includeDeleted", label: "Deleted", options: [{ value: "true", label: "Include deleted" }] });
  return <FilterBar filters={filters} search={{ placeholder: "Search company, contact, email…" }} />;
}
