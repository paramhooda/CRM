import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** An uppercase section caption with an optional note on the right. */
export function SectionLabel({ children, note, className }: { children: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-baseline justify-between gap-4", className)}>
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{children}</h2>
      {note && <span className="text-sm text-muted-foreground">{note}</span>}
    </div>
  );
}
