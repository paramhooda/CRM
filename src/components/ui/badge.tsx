import * as React from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/constants";

export function Badge({
  tone = "slate",
  className,
  children,
  dot,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap leading-4",
        className,
      )}
      style={{ background: `var(--t-${tone}-bg)`, color: `var(--t-${tone})` }}
      {...props}
    >
      {dot && <span className="size-1.5 rounded-full" style={{ background: "currentColor" }} />}
      {children}
    </span>
  );
}
