"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { Briefcase, Building2, CheckSquare, ClipboardList, Contact, Home, KeyRound, ListChecks, LogOut, Moon, Package, PanelLeftClose, PanelLeftOpen, Plus, ScrollText, Search, Settings2, ShieldCheck, SlidersHorizontal, Sun, Target, Users, UserSquare2, type LucideIcon } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Logo } from "./logo";
import { api } from "@/client/api";
import { useActor } from "./providers";
import { ROLE_LABEL } from "@/contracts/users";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; badge?: number };

/** One line per module. Creating things happens on each module's own page ("New deal" on Deals, and so on). */
function navFor(role: string, pendingApprovals: number, needsYou: number): { main: Item[]; admin: Item[] } {
  if (role === "PRESALES" || role === "PURCHASE") {
    return { main: [{ href: "/my-work", label: "My work", icon: ListChecks, badge: needsYou }, { href: "/deals", label: "Deals", icon: Briefcase }, { href: "/accounts", label: "Accounts", icon: Building2 }], admin: [] };
  }
  const main: Item[] = [
    { href: "/home", label: "Home", icon: Home, badge: needsYou },
    { href: "/deals", label: "Deals", icon: Briefcase },
    { href: "/accounts", label: "Accounts", icon: Building2 },
    { href: "/contacts", label: "Contacts", icon: Contact },
    { href: "/leads", label: "Leads", icon: UserSquare2 },
    { href: "/approvals", label: "Approvals", icon: CheckSquare, badge: pendingApprovals },
    { href: "/reviews", label: "Pipeline review", icon: ClipboardList },
  ];
  if (role === "SALES_HEAD") main.push({ href: "/admin/targets", label: "Targets", icon: Target });
  const admin: Item[] = role === "ADMIN"
    ? [
        { href: "/admin/users", label: "Users", icon: Users },
        { href: "/admin/lookups", label: "Master data", icon: Settings2 },
        { href: "/admin/products", label: "Products", icon: Package },
        { href: "/admin/approval-rules", label: "Approval rules", icon: ShieldCheck },
        { href: "/admin/targets", label: "Targets", icon: Target },
        { href: "/admin/audit", label: "Audit log", icon: ScrollText },
        { href: "/admin/settings", label: "Settings", icon: SlidersHorizontal },
      ]
    : [];
  return { main, admin };
}

/** Lists that take `?q=`: the top-bar search goes to the one the person is on, else to deals. */
const SEARCHABLE: { href: string; label: string }[] = [
  { href: "/deals", label: "deals" },
  { href: "/accounts", label: "accounts" },
  { href: "/contacts", label: "contacts" },
  { href: "/leads", label: "leads" },
  { href: "/admin/products", label: "products" },
];
const searchTarget = (pathname: string) => SEARCHABLE.find((s) => pathname === s.href || pathname.startsWith(s.href + "/")) ?? SEARCHABLE[0]!;

function TopSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const target = searchTarget(pathname);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("top-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form
      role="search"
      className="relative hidden min-w-0 flex-1 md:block md:max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        router.push(term ? `${target.href}?q=${encodeURIComponent(term)}` : target.href);
        setQ("");
      }}
    >
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
      <Input id="top-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${target.label}, accounts, contacts…`} aria-label="Search" className="h-11 rounded-xl pl-11 pr-14 text-[15px]" />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-border bg-muted px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground">⌘K</kbd>
    </form>
  );
}

const cardActive = "data-active:bg-card data-active:text-foreground data-active:font-medium data-active:shadow-card data-active:ring-1 data-active:ring-border";

function NavItem({ item, pathname }: { item: Item; pathname: string }) {
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
  const badge = item.badge ?? 0;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={badge ? `${item.label} (${badge})` : item.label} className={cn("h-10 rounded-lg px-3 text-[15px] group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:justify-center", cardActive)}>
        <Link href={item.href}>
          <span className="relative inline-flex shrink-0">
            <item.icon />
            {badge > 0 && <span className="absolute -right-1 -top-1 hidden size-2 rounded-full bg-destructive group-data-[collapsible=icon]:block" aria-hidden />}
          </span>
          <span className="flex-1 truncate">{item.label}</span>
        </Link>
      </SidebarMenuButton>
      {badge > 0 && <SidebarMenuBadge className="right-3 bg-destructive text-destructive-foreground peer-data-active/menu-button:text-destructive-foreground peer-hover/menu-button:text-destructive-foreground">{badge}</SidebarMenuBadge>}
    </SidebarMenuItem>
  );
}

/** The sidebar's own minimise control: a labelled button when open, an icon with a tooltip when collapsed. */
function MinimiseButton() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton onClick={toggleSidebar} tooltip="Expand" aria-label={collapsed ? "Expand" : "Minimise"} className="h-10 rounded-lg px-3 text-[15px] text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:justify-center">
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          <span>Minimise</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppShell({ children, sidebarOpen, pendingApprovals = 0, needsYou = 0 }: { children: ReactNode; sidebarOpen: boolean; pendingApprovals?: number; needsYou?: number }) {
  const actor = useActor();
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const nav = useMemo(() => navFor(actor.role, pendingApprovals, needsYou), [actor.role, pendingApprovals, needsYou]);
  const support = actor.role === "PRESALES" || actor.role === "PURCHASE";
  const home = support ? "/my-work" : "/home";

  // A temporary password must be replaced before anything else
  useEffect(() => {
    if (actor.mustChangePassword && pathname !== "/account") router.replace("/account?change=1");
  }, [actor.mustChangePassword, pathname, router]);

  const signOut = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      // A full reload on purpose: nothing from the signed-in session should survive
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    }
  };

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <Sidebar collapsible="icon">
        <SidebarHeader className="px-5 pt-5 pb-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
          <Link href={home} className="flex items-center overflow-hidden" aria-label="Progression CRM home">
            <Logo height={28} className="group-data-[collapsible=icon]:hidden" />
            <Logo variant="mark" height={24} className="hidden group-data-[collapsible=icon]:block" />
          </Link>
        </SidebarHeader>
        <SidebarContent className="px-3 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center">
          <SidebarGroup className="py-1">
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5" aria-label="Modules">
                {nav.main.map((it) => <NavItem key={it.href} item={it} pathname={pathname} />)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {nav.admin.length > 0 && (
            <SidebarGroup className="py-1">
              <SidebarGroupLabel className="h-8 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Admin</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5" aria-label="Admin">
                  {nav.admin.map((it) => <NavItem key={it.href} item={it} pathname={pathname} />)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>
        <SidebarFooter className="px-3 pb-4 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center">
          <MinimiseButton />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 flex h-[76px] shrink-0 items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
          <SidebarTrigger aria-label="Toggle sidebar" className="text-muted-foreground" />
          <TopSearch />
          <div className="flex-1" />
          {!support && (
            <Button asChild variant="outline" size="lg" className="rounded-xl">
              <Link href="/deals/new"><Plus /> New deal</Link>
            </Button>
          )}
          {!support && (
            <Button asChild variant="ghost" size="icon-lg" aria-label={`Approvals waiting on you: ${pendingApprovals}`} className="relative rounded-xl">
              <Link href="/approvals">
                <CheckSquare className="size-5" />
                {pendingApprovals > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-destructive-foreground tabular">{pendingApprovals}</span>}
              </Link>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="lg" aria-label="Account menu" className="h-11 gap-2.5 rounded-xl px-2">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-selected text-xs font-semibold text-selected-foreground">{initials(actor.fullName)}</AvatarFallback>
                </Avatar>
                <span className="hidden text-[15px] font-medium sm:inline">{actor.fullName}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <div className="text-sm font-medium">{actor.fullName}</div>
                <div className="text-xs text-muted-foreground">{actor.email}</div>
                <div className="text-xs text-muted-foreground">{ROLE_LABEL[actor.role]}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/account"><KeyRound /> Change password</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label="Toggle dark mode">
                {resolvedTheme === "dark" ? <Sun /> : <Moon />} {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut}><LogOut /> Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className={cn("mx-auto w-full max-w-[1600px] flex-1 px-4 py-8 sm:px-8")}>{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
