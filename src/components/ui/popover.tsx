"use client";
import * as React from "react";
import * as P from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;

export function PopoverContent({ className, align = "start", ...props }: P.PopoverContentProps) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={6}
        className={cn("z-50 rounded-xl border border-border bg-surface p-1 shadow-lg outline-none", className)}
        {...props}
      />
    </P.Portal>
  );
}
