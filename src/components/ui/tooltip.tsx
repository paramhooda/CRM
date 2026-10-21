"use client";
import * as React from "react";
import * as T from "@radix-ui/react-tooltip";

export const TooltipProvider = T.Provider;

export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <T.Root delayDuration={150}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          sideOffset={6}
          className="z-50 max-w-72 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink-2 shadow-lg"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
