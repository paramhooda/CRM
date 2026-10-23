"use client";
import * as React from "react";
import * as M from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const Dropdown = M.Root;
export const DropdownTrigger = M.Trigger;

export function DropdownContent({ className, align = "end", ...props }: M.DropdownMenuContentProps) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn("z-50 min-w-44 rounded-xl border border-border bg-surface p-1 shadow-lg", className)}
        {...props}
      />
    </M.Portal>
  );
}

export function DropdownItem({ className, ...props }: M.DropdownMenuItemProps) {
  return (
    <M.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-ink-2 outline-none data-[highlighted]:bg-surface-hover data-[highlighted]:text-ink [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownLabel({ className, ...props }: M.DropdownMenuLabelProps) {
  return <M.Label className={cn("px-2 py-1.5 text-xs text-ink-3", className)} {...props} />;
}

export function DropdownSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />;
}
