"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { Columns3, List } from "lucide-react";
import { Segmented } from "@/components/crm/segmented";
import { queryString } from "@/lib/url-state";

/** List or board, kept in the URL so filters and exports stay in step. */
export function ViewToggle() {
  const pathname = usePathname();
  const params = useSearchParams();
  const view = params.get("view") === "kanban" ? "kanban" : "list";
  const href = (v: "list" | "kanban") => `${pathname}${queryString(params, { view: v === "kanban" ? "kanban" : null, page: null })}`;
  return (
    <Segmented
      aria-label="View"
      value={view}
      options={[
        { value: "list", label: <span className="inline-flex items-center gap-1.5"><List className="size-4" aria-hidden /> List</span>, href: href("list") },
        { value: "kanban", label: <span className="inline-flex items-center gap-1.5"><Columns3 className="size-4" aria-hidden /> Board</span>, href: href("kanban") },
      ]}
    />
  );
}
