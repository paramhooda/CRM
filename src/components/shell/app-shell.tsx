"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, KanbanSquare, Briefcase, Building2, Users, UserPlus, Inbox, History, BarChart3, Settings,
  Menu, X, Search,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/crm/logo";
import { Avatar } from "@/components/crm/badges";
import { ROLE_LABEL } from "@/lib/constants";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "./notification-bell";
import { CommandMenu } from "./command-menu";
import { ThemeToggle } from "./theme-toggle";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; roles?: Role[]; badge?: number };

export function AppShell({
  user,
  counts,
  children,
}: {
  user: { id: string; name: string; email: string; role: Role; title: string | null };
  counts: { unread: number; requests: number };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  const sections: { title?: string; items: NavItem[] }[] = [
    {
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
        { href: "/opportunities", label: "Opportunities", icon: Briefcase },
        {
          href: "/requests",
          label: user.role === "PURCHASE" ? "Pricing requests" : user.role === "PRESALES" ? "BOQ requests" : "Requests",
          icon: Inbox,
          badge: counts.requests,
        },
      ],
    },
    {
      title: "Customers",
      items: [
        { href: "/accounts", label: "Accounts", icon: Building2 },
        { href: "/contacts", label: "Contacts", icon: Users },
        { href: "/leads", label: "Leads", icon: UserPlus, roles: ["ADMIN", "SALES_HEAD", "SALES"] },
      ],
    },
    {
      title: "Insights",
      items: [
        { href: "/reviews", label: "Pipeline review", icon: History, roles: ["ADMIN", "SALES_HEAD", "SALES"] },
        { href: "/reports", label: "Reports", icon: BarChart3, roles: ["ADMIN", "SALES_HEAD", "SALES"] },
      ],
    },
    { title: "Admin", items: [{ href: "/admin", label: "Settings", icon: Settings, roles: ["ADMIN"] }] },
  ];

  const nav = (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-3 scrollbar-thin">
      {sections.map((s, i) => {
        const items = s.items.filter((it) => !it.roles || it.roles.includes(user.role));
        if (!items.length) return null;
        return (
          <div key={i}>
            {s.title && <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-ink-3">{s.title}</p>}
            <ul className="flex flex-col gap-0.5">
              {items.map((it) => {
                const active = pathname === it.href || pathname.startsWith(it.href + "/");
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                        active ? "bg-surface-hover font-medium text-ink" : "text-ink-2 hover:bg-surface-hover hover:text-ink",
                      )}
                    >
                      <it.icon className={cn("size-4", active ? "text-primary" : "text-ink-3")} />
                      <span className="flex-1">{it.label}</span>
                      {!!it.badge && (
                        <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-ink tabular">
                          {it.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-surface transition-transform md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <Logo size={26} />
          <span className="text-[14px] font-semibold tracking-tight">Progression</span>
          <span className="rounded bg-surface-2 px-1.5 text-[10px] font-medium text-ink-3">CRM</span>
          <button className="ml-auto md:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="size-4" />
          </button>
        </div>
        {nav}
        <div className="flex items-center gap-2 border-t border-border p-3">
          <Avatar name={user.name} className="size-7" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{user.name}</p>
            <p className="truncate text-xs text-ink-3">{ROLE_LABEL[user.role]}</p>
          </div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/20 md:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-surface/85 px-4 backdrop-blur md:px-6 no-print">
          <button className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <button
            onClick={() => setCmdOpen(true)}
            className="flex h-8 w-full max-w-sm items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 text-[13px] text-ink-3 hover:border-border-strong cursor-pointer"
          >
            <Search className="size-3.5" />
            <span className="flex-1 truncate text-left">Search deals, accounts, contacts…</span>
            <kbd className="hidden rounded border border-border bg-surface px-1 font-mono text-[10px] sm:inline">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell unread={counts.unread} />
            <UserMenu user={user} />
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
      <CommandMenu open={cmdOpen} setOpen={setCmdOpen} role={user.role} />
    </div>
  );
}
