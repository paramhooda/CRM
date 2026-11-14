import Link from "next/link";
import { cn } from "@/lib/utils";

export type LineTab = { key: string; label: React.ReactNode; href: string; count?: number };

/** Underline tabs that navigate: dark text and a 2px rule under the active one. */
export function LineTabs({ tabs, active, className }: { tabs: LineTab[]; active: string; className?: string }) {
  return (
    <nav className={cn("mb-6 flex gap-1 overflow-x-auto border-b border-border", className)} aria-label="Sections">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link key={t.key} href={t.href} scroll={false} aria-current={on ? "page" : undefined} className={cn("-mb-px inline-flex h-11 items-center gap-2 whitespace-nowrap border-b-2 px-4 text-[15px] font-medium transition-colors", on ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
            {t.count !== undefined && <span className={cn("rounded-md px-1.5 text-xs tabular", on ? "bg-selected text-selected-foreground" : "bg-muted text-muted-foreground")}>{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
