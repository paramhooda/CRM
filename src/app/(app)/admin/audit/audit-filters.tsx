"use client";
import { FilterBar } from "@/components/crm/filter-bar";
import { ACTION_LABEL, ENTITY_LABEL } from "@/lib/labels";

export function AuditFilters({ users }: { users: { id: string; fullName: string }[] }) {
  return (
    <FilterBar
      filters={[
        { key: "entity_type", label: "Record type", options: Object.entries(ENTITY_LABEL).map(([value, label]) => ({ value, label })) },
        { key: "action", label: "Action", options: Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label })) },
        { key: "user_id", label: "Who", options: users.map((u) => ({ value: u.id, label: u.fullName })) },
      ]}
    />
  );
}
