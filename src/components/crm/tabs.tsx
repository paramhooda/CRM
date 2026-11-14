"use client";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/** Underline tabs inside a page: a full-width rule with the active tab marked by a 2px bar. Use with `Tabs`/`TabsContent`. */
export function TabBar({ className, ...props }: React.ComponentProps<typeof TabsList>) {
  return <TabsList variant="line" className={cn("h-11 w-full justify-start gap-0 rounded-none border-b border-border p-0", className)} {...props} />;
}

export function Tab({ className, ...props }: React.ComponentProps<typeof TabsTrigger>) {
  return <TabsTrigger className={cn("h-11 flex-none rounded-none border-0 px-4 text-[15px] font-medium text-muted-foreground hover:text-foreground data-active:text-foreground group-data-horizontal/tabs:after:-bottom-px", className)} {...props} />;
}

/** The small count beside a tab's label. */
export function TabCount({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-muted px-1.5 text-xs text-muted-foreground tabular group-data-active/tab:bg-selected">{children}</span>;
}
