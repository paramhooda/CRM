"use client";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Downloads the current list, with the current filters, as CSV. */
export function ExportButton({ entity, label = "Export" }: { entity: string; label?: string }) {
  const params = useSearchParams();
  const qs = params.toString();
  return (
    <Button asChild variant="outline" size="sm">
      <a href={`/api/v1/exports/${entity}${qs ? `?${qs}` : ""}`} download>
        <Download /> {label}
      </a>
    </Button>
  );
}
