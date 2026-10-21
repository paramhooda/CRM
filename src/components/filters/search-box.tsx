"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";

export function SearchBox({ placeholder = "Search" }: { placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  useEffect(() => {
    if (q === (sp.get("q") ?? "")) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(sp.toString());
      if (q.trim()) next.set("q", q.trim());
      else next.delete("q");
      router.replace(`${pathname}?${next.toString()}`);
    }, 300);
    return () => clearTimeout(t);
  }, [q, sp, pathname, router]);
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-64 rounded-md border border-border bg-surface pl-8 pr-2 text-[13px] outline-none placeholder:text-ink-3 hover:border-border-strong focus:border-ring"
      />
    </div>
  );
}
