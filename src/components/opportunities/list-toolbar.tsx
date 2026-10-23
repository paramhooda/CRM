"use client";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem } from "@/components/ui/dropdown";

export function ListToolbar({ canCreate }: { canCreate: boolean }) {
  const sp = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const showClosed = sp.get("closed") === "1";
  const qs = sp.toString();


  return (
    <>
      <label className="inline-flex items-center gap-1.5 text-xs text-ink-2">
        <input
          type="checkbox"
          checked={showClosed}
          onChange={(e) => {
            const next = new URLSearchParams(qs);
            if (e.target.checked) next.set("closed", "1");
            else next.delete("closed");
            router.replace(`${pathname}?${next.toString()}`);
          }}
          className="accent-[var(--primary)]"
        />
        Include closed
      </label>
      <Dropdown>
        <DropdownTrigger asChild>
          <Button><Download /> Export</Button>
        </DropdownTrigger>
        <DropdownContent className="w-64">
          <DropdownItem asChild><a href={`/api/export/opportunities?${qs}`}>Deals (one row per opportunity)</a></DropdownItem>
          <DropdownItem asChild><a href={`/api/export/opportunities?${qs}${qs ? "&" : ""}mode=lines`}>Line items (one row per product, billing-ready)</a></DropdownItem>
        </DropdownContent>
      </Dropdown>
      {canCreate && (
        <Button asChild variant="primary">
          <Link href="/opportunities/new"><Plus /> New opportunity</Link>
        </Button>
      )}
    </>
  );
}
