"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { listNotifications, markNotificationsRead } from "@/server/actions/notifications";
import { relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";

type N = Awaited<ReturnType<typeof listNotifications>>[number];

export function NotificationBell({ unread }: { unread: number }) {
  const [items, setItems] = useState<N[] | null>(null);
  const [pending, start] = useTransition();
  const [count, setCount] = useState(unread);
  if (count !== unread && items === null) setCount(unread);

  return (
    <Popover
      onOpenChange={(o) => {
        if (o) start(async () => setItems(await listNotifications()));
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell />
          {count > 0 && (
            <span className="absolute right-1 top-1 min-w-4 rounded-full bg-critical px-1 text-[10px] font-semibold leading-4 text-white tabular">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-[13px] font-semibold">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              start(async () => {
                await markNotificationsRead();
                setCount(0);
                setItems((xs) => xs?.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })) ?? null);
              })
            }
          >
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
          {pending && !items && <p className="p-4 text-xs text-ink-3">Loading…</p>}
          {items?.length === 0 && (
            <div className="flex flex-col items-center gap-1 p-6 text-xs text-ink-3">
              <Inbox className="size-5" /> You are all caught up
            </div>
          )}
          {items?.map((n) => (
            <Link
              key={n.id}
              href={n.link ?? "#"}
              onClick={() => markNotificationsRead([n.id])}
              className={cn("flex gap-2.5 border-b border-border px-3 py-2.5 last:border-0 hover:bg-surface-hover", !n.readAt && "bg-primary-soft/50")}
            >
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium leading-snug">{n.title}</span>
                {n.body && <span className="block text-xs text-ink-3">{n.body}</span>}
                <span className="block text-[11px] text-ink-3">{relativeDays(n.createdAt)}</span>
              </span>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
