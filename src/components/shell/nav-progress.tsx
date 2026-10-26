"use client";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Thin top progress bar while a link navigation is in flight. Replaces a route-group loading.tsx, which in
 * Next 15 production stalls navigations that only change the query string (filters, review windows).
 */
export function NavProgress() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const [active, setActive] = useState(false);
  useEffect(() => setActive(false), [pathname, sp]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setActive(true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  // Safety net: never leave the bar running
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(false), 10_000);
    return () => clearTimeout(t);
  }, [active]);
  return (
    <div aria-hidden className={cn("fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden transition-opacity", active ? "opacity-100" : "opacity-0")}>
      <div className="h-full w-1/3 animate-[crm-progress_1s_ease-in-out_infinite] bg-primary" />
    </div>
  );
}
