"use client";
import { useSearchParams } from "next/navigation";
import { FilterBar, type FilterDef } from "./filter-bar";
import { useActor, useLookups } from "./providers";
import { periodOptions } from "@/domain/fiscal";
import { FORECAST_LABEL } from "./pills";

export type OwnerOption = { id: string; fullName: string };

/** The filters every sales view shares: period, BU, Sub BU (within the BU), OEM, owner, plus stage and forecast where asked. */
export function DealFilters({ owners, stages, forecast, period = true, search = true }: { owners: OwnerOption[]; stages?: boolean; forecast?: boolean; period?: boolean; search?: boolean }) {
  const L = useLookups();
  const actor = useActor();
  const params = useSearchParams();
  const bu = params.get("bu");
  const filters: FilterDef[] = [];
  if (period) filters.push({ key: "period", label: "Close date", options: periodOptions().map((p) => ({ value: p.key, label: p.label })) });
  if (stages) filters.push({ key: "stage", label: "Stage", options: L.stages.map((s) => ({ value: s.key, label: s.label })) });
  if (forecast) filters.push({ key: "forecast", label: "Forecast", options: L.forecasts.map((f) => ({ value: f.key, label: FORECAST_LABEL[f.key] })) });
  filters.push({ key: "bu", label: "Business unit", options: L.businessUnits.map((b) => ({ value: b.id, label: b.name })) });
  filters.push({ key: "sub_bu", label: "Sub BU", options: L.subBusinessUnits.filter((s) => !bu || s.businessUnitId === bu).map((s) => ({ value: s.id, label: s.name })) });
  filters.push({ key: "oem", label: "OEM", options: L.oems.map((o) => ({ value: o.id, label: o.name })) });
  if (actor.role !== "SALES" && owners.length > 1) filters.push({ key: "owner", label: "Sales person", options: owners.map((o) => ({ value: o.id, label: o.fullName })) });
  return <FilterBar filters={filters} search={search ? { placeholder: "Search deals, accounts…" } : undefined} />;
}
