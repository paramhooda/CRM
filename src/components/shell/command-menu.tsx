"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import * as D from "@radix-ui/react-dialog";
import { Briefcase, Building2, User, LayoutDashboard, KanbanSquare, Plus, History, Inbox, BarChart3, Search, Package, PanelLeft } from "lucide-react";
import type { Role } from "@prisma/client";
import { globalSearch, type SearchHit } from "@/server/actions/search";
import { TOGGLE_SIDEBAR_EVENT } from "@/lib/ui-prefs";

const ICON = { opportunity: Briefcase, account: Building2, contact: User, product: Package };

export function CommandMenu({ open, setOpen, role }: { open: boolean; setOpen: (o: boolean) => void; role: Role }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    const t = setTimeout(() => start(async () => setHits(q.trim().length >= 2 ? await globalSearch(q) : [])), 180);
    return () => clearTimeout(t);
  }, [q]);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };
  const canSell = role === "ADMIN" || role === "SALES_HEAD" || role === "SALES";
  const nav = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Pipeline board", href: "/pipeline", icon: KanbanSquare },
    { label: "Opportunities", href: "/opportunities", icon: Briefcase },
    { label: "Requests inbox", href: "/requests", icon: Inbox },
    ...(canSell
      ? [
          { label: "New opportunity", href: "/opportunities/new", icon: Plus },
          { label: "Changes since last review", href: "/reviews", icon: History },
          { label: "Reports", href: "/reports", icon: BarChart3 },
          { label: "Dying opportunities", href: "/opportunities?health=DYING", icon: Briefcase },
          { label: "Hot opportunities", href: "/opportunities?health=HOT", icon: Briefcase },
        ]
      : []),
  ];

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <D.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <D.Title className="sr-only">Search</D.Title>
          <D.Description className="sr-only">Search records and navigate</D.Description>
          <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-ink-3">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 text-ink-3" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Search by deal, code, account or contact…"
                className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-ink-3"
              />
            </div>
            <Command.List className="max-h-[360px] overflow-y-auto p-1 scrollbar-thin">
              <Command.Empty className="p-4 text-center text-xs text-ink-3">No matches.</Command.Empty>
              {hits.length > 0 && (
                <Command.Group heading="Records">
                  {hits.map((h) => {
                    const Icon = ICON[h.type];
                    return (
                      <Command.Item key={h.type + h.id} value={h.type + h.id} onSelect={() => go(h.href)} className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 data-[selected=true]:bg-surface-hover">
                        <Icon className="size-4 text-ink-3" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px]">{h.title}</span>
                          <span className="block truncate text-xs text-ink-3">{h.sub}</span>
                        </span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}
              {q.trim().length < 2 && (
                <Command.Group heading="Go to">
                  {nav.map((n) => (
                    <Command.Item key={n.href} value={n.href} onSelect={() => go(n.href)} className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-[13px] data-[selected=true]:bg-surface-hover">
                      <n.icon className="size-4 text-ink-3" />
                      {n.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {q.trim().length < 2 && (
                <Command.Group heading="Actions">
                  <Command.Item
                    value="toggle-sidebar"
                    onSelect={() => {
                      setOpen(false);
                      window.dispatchEvent(new Event(TOGGLE_SIDEBAR_EVENT));
                    }}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-[13px] data-[selected=true]:bg-surface-hover"
                  >
                    <PanelLeft className="size-4 text-ink-3" />
                    Toggle sidebar
                    <kbd className="ml-auto rounded border border-border px-1 font-mono text-[10px] text-ink-3">Ctrl/⌘ B</kbd>
                  </Command.Item>
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
