"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Columns3, List } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { queryString } from "@/lib/url-state";

export function ViewToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = params.get("view") === "kanban" ? "kanban" : "list";
  return (
    <ToggleGroup type="single" size="sm" variant="outline" value={view} onValueChange={(v) => v && router.replace(`${pathname}${queryString(params, { view: v === "kanban" ? "kanban" : null, page: null })}`)} aria-label="View">
      <ToggleGroupItem value="list" aria-label="List view"><List /></ToggleGroupItem>
      <ToggleGroupItem value="kanban" aria-label="Board view"><Columns3 /></ToggleGroupItem>
    </ToggleGroup>
  );
}
