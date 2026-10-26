"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  wide,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px] data-[state=open]:animate-in" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-[8vh] z-50 max-h-[84vh] w-[calc(100vw-32px)] -translate-x-1/2 overflow-y-auto rounded-xl border border-border bg-surface shadow-2xl",
          wide ? "max-w-3xl" : "max-w-lg",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-3.5">
          <div>
            <D.Title className="text-sm font-semibold">{title}</D.Title>
            {description ? (
              <D.Description className="mt-0.5 text-xs text-ink-3">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close className="rounded p-1 text-ink-3 hover:bg-surface-hover hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="px-5 py-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

/** Right-hand side panel (Salesforce-style record preview). Full width on phones. */
export function SheetContent({
  title,
  description,
  children,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/20" />
      <D.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col border-l border-border bg-surface shadow-2xl outline-none">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <D.Title className="truncate text-[15px] font-semibold">{title}</D.Title>
            {description ? (
              <D.Description asChild><div className="mt-0.5 text-xs text-ink-3">{description}</div></D.Description>
            ) : (
              <D.Description className="sr-only">Details</D.Description>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            <D.Close className="rounded p-1 text-ink-3 hover:bg-surface-hover hover:text-ink" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
