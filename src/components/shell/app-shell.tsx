"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard, KanbanSquare, Briefcase, Building2, Users, UserPlus, Inbox, History, BarChart3, Settings,
  Menu, X, Search, Package, PanelLeft, ClipboardList, Calculator,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/crm/logo";
import { Avatar } from "@/components/crm/badges";
import { Tooltip } from "@/components/ui/tooltip";
import { ROLE_LABEL } from "@/lib/constants";
import { SIDEBAR_COOKIE, TOGGLE_SIDEBAR_EVENT } from "@/lib/ui-prefs";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "./notification-bell";
import { CommandMenu } from "./command-menu";
import { NavProgress } from "./nav-progress";
import { ThemeToggle } from "./theme-toggle";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; badge?: number };
type NavSection = { title?: string; items: NavItem[] };

function navFor(role: Role, requests: number): NavSection[] {
  if (role === "PRESALES" || role === "PURCHASE") {
    // Their job is BOQs and pricing: work first, everything else readable below
    return [
      {
        items: [
          { href: "/dashboard", label: "My work", icon: LayoutDashboard },
          {
            href: "/requests",
            label: role === "PRESALES" ? "BOQ requests" : "Pricing requests",
            icon: role === "PRESALES" ? ClipboardList : Calculator,
            badge: requests,
          },
        ],
      },
      {
        title: "Deals",
        items: [
          { href: "/opportunities", label: "Opportunities", icon: Briefcase },
          { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
        ],
      },
      {
        title: "Customers",
        items: [
          { href: "/accounts", label: "Accounts", icon: Building2 },
          { href: "/contacts", label: "Contacts", icon: Users },
        ],
      },
      {
        title: "Catalogue",
        items: [
          { href: "/products", label: "Products", icon: Package },
          { href: "/reports", label: "Reports", icon: BarChart3 },
        ],
      },
    ];
  }
  const sections: NavSection[] = [
    {
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
        { href: "/opportunities", label: "Opportunities", icon: Briefcase },
        { href: "/requests", label: "Requests", icon: Inbox, badge: requests },
      ],
    },
    {
      title: "Customers",
      items: [
        { href: "/accounts", label: "Accounts", icon: Building2 },
        { href: "/contacts", label: "Contacts", icon: Users },
        { href: "/leads", label: "Leads", icon: UserPlus },
      ],
    },
    {
      title: "Insights",
      items: [
        { href: "/reviews", label: "Pipeline review", icon: History },
        { href: "/reports", label: "Reports", icon: BarChart3 },
      ],
    },
    { title: "Catalogue", items: [{ href: "/products", label: "Products", icon: Package }] },
  ];
  if (role === "ADMIN") sections.push({ title: "Admin", items: [{ href: "/admin", label: "Settings", icon: Settings }] });
  return sections;
}


export function AppShell({
  user,
  counts,
  sidebar,
  children,
}: {
  user: { id: string; name: string; email: string; role: Role; title: string | null };
  counts: { unread: number; requests: number };
  /** Saved sidebar state from the cookie; null when the user never chose */
  sidebar: "rail" | "full" | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(sidebar === "rail");
  const [mod, setMod] = useState("Ctrl+");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setMod("⌘");
  }, []);
  useEffect(() => {
    // No saved preference: tablets start with the icon rail to leave room for content
    if (sidebar === null && window.matchMedia("(min-width: 768px) and (max-width: 1279px)").matches) setCollapsed(true);
  }, [sidebar]);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      document.cookie = `${SIDEBAR_COOKIE}=${c ? "full" : "rail"}; path=/; max-age=31536000; samesite=lax`;
      return !c;
    });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(TOGGLE_SIDEBAR_EVENT, toggleCollapsed);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(TOGGLE_SIDEBAR_EVENT, toggleCollapsed);
    };
  }, [toggleCollapsed]);
  const sections = navFor(user.role, counts.requests);
  const rail = collapsed && !open;

  const nav = (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4 scrollbar-thin">
      {sections.map((s, i) => (
        <div key={i}>
          {s.title && !rail && <p className="px-2.5 pb-1.5 text-xs text-ink-3">{s.title}</p>}
          {s.title && rail && <div className="mx-2.5 mb-2 h-px bg-border" />}
          <ul className="flex flex-col gap-0.5">
            {s.items.map((it) => {
              const active = pathname === it.href || pathname.startsWith(it.href + "/");
              const link = (
                <Link
                  href={it.href}
                  // Never prefetch the page you are on: Next keys auto-prefetches of dynamic pages by path, so an
                  // in-flight prefetch of the current page would stall in-page navigations that change only the query
                  prefetch={active ? false : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
                    active ? "bg-surface-hover font-medium text-ink" : "text-ink-2 hover:bg-surface-hover/70 hover:text-ink",
                    rail && "justify-center px-0",
                  )}
                >
                  <it.icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-ink-3")} />
                  {!rail && <span className="flex-1 truncate">{it.label}</span>}
                  {!!it.badge &&
                    (rail ? (
                      <span className="absolute right-3 top-2 size-2 rounded-full bg-primary ring-2 ring-page" aria-label={`${it.badge} open`} />
                    ) : (
                      <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-ink tabular">{it.badge}</span>
                    ))}
                </Link>
              );
              return <li key={it.href}>{rail ? <Tooltip content={it.badge ? `${it.label} · ${it.badge}` : it.label} side="right">{link}</Tooltip> : link}</li>;
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-page transition-[width,transform] duration-200 md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
          rail ? "w-[64px]" : "w-[232px]",
        )}
      >
        <div className={cn("flex h-16 items-center gap-2 px-5", rail && "justify-center px-0")}>
          <Link href="/dashboard" prefetch={pathname === "/dashboard" ? false : undefined} className="flex items-center gap-2" aria-label="Progression CRM home">
            {rail ? <Logo variant="mark" height={24} /> : <Logo height={22} />}
            {!rail && <span className="rounded-md border border-border px-1.5 text-[10px] font-medium leading-4 text-ink-3">CRM</span>}
          </Link>
          <button className="ml-auto md:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="size-4" />
          </button>
        </div>
        {/* Edge handle: click the sidebar border to collapse or expand */}
        <button
          onClick={toggleCollapsed}
          aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
          title={`${rail ? "Expand" : "Collapse"} sidebar (${mod}B)`}
          className="group absolute inset-y-0 -right-1.5 hidden w-3 cursor-col-resize md:block"
        >
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-primary/60" />
        </button>
        {nav}
        <div className={cn("flex items-center gap-2.5 border-t border-border p-3", rail && "justify-center")}>
          <Avatar name={user.name} className="size-8" />
          {!rail && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{user.name}</p>
              <p className="truncate text-xs text-ink-3">{ROLE_LABEL[user.role]}</p>
            </div>
          )}
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/20 md:hidden" onClick={() => setOpen(false)} />}

      <div className={cn("flex min-w-0 flex-1 flex-col transition-[padding] duration-200", rail ? "md:pl-[64px]" : "md:pl-[232px]")}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/80 px-5 backdrop-blur-md md:px-8 no-print">
          <button className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <Tooltip content={`${rail ? "Expand" : "Collapse"} sidebar · ${mod}B`}>
            <button
              onClick={toggleCollapsed}
              aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={!rail}
              className="-ml-2 hidden size-9 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-hover hover:text-ink md:inline-flex cursor-pointer"
            >
              <PanelLeft className="size-[18px]" />
            </button>
          </Tooltip>
          <button
            onClick={() => setCmdOpen(true)}
            className="flex h-9 min-w-0 max-w-md flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-[13px] text-ink-3 transition-colors hover:border-border-strong cursor-pointer"
          >
            <Search className="size-4" />
            <span className="min-w-0 flex-1 truncate text-left">Search deals, accounts, products…</span>
            <kbd className="hidden rounded-md border border-border bg-surface-2 px-1.5 font-mono text-[10px] sm:inline">⌘K</kbd>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <ThemeToggle />
            <NotificationBell unread={counts.unread} />
            <UserMenu user={user} />
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
      <CommandMenu open={cmdOpen} setOpen={setCmdOpen} role={user.role} />
      <Suspense>
        <NavProgress />
      </Suspense>
    </div>
  );
}
