"use client";
// Optional fields tucked away: forms show only what is required, and "More options" reveals the rest.
// The content stays mounted (just hidden), so its inputs keep their defaults and are still submitted with the form.
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function MoreOptions({
  label = "More options", hint, forceOpen = false, children, className,
}: {
  label?: string;
  /** Short summary shown while closed, e.g. "Auto-assign · BOQ" */
  hint?: React.ReactNode;
  /** Open it (and keep it open) when something inside needs attention, e.g. a validation error */
  forceOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(forceOpen);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((x) => !x)}
        className="flex w-fit items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink cursor-pointer"
      >
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        {label}
        {!open && hint && <span className="font-normal text-ink-3">· {hint}</span>}
      </button>
      <div hidden={!open} className="flex flex-col gap-3">
        {children}
      </div>
    </div>
  );
}
