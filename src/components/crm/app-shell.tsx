"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { Briefcase, Building2, CheckSquare, ChevronDown, ChevronRight, ClipboardList, Contact, Filter, Home, KeyRound, ListChecks, LogOut, Moon, Package, Plus, ScrollText, Search, Settings2, ShieldCheck, Sun, Target, Users, UserSquare2, type LucideIcon } from "lucide-react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
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

type Leaf = { href: string; label: string };
type Item = { href: string; label: string; icon: LucideIcon; children?: Leaf[] };
type Group = { label: string; items: Item[] };

function navFor(role: string, actorId: string): Group[] {
  if (role === "PRESALES" || role === "PURCHASE") {
    return [{ label: "Work", items: [{ href: "/my-work", label: "My work", icon: ListChecks }, { href: "/deals", label: "Deals", icon: Briefcase }, { href: "/accounts", label: "Accounts", icon: Building2 }] }];
  }
  const deals: Leaf[] = [{ href: "/deals", label: "All open" }];
  if (role !== "SALES") deals.push({ href: `/deals?owner=${actorId}`, label: "Assigned to me" });
  deals.push({ href: "/deals?view=kanban", label: "Board" }, { href: "/deals?stage=CLOSED_WON", label: "Closed-won" }, { href: "/deals/new", label: "New deal" });
  const groups: Group[] = [
    {
      label: "Sales",
      items: [
        { href: "/home", label: "Home", icon: Home },
        { href: "/deals", label: "Deals", icon: Briefcase, children: deals },
        { href: "/accounts", label: "Accounts", icon: Building2, children: [{ href: "/accounts", label: "All accounts" }, { href: "/accounts/new", label: "New account" }] },
        { href: "/contacts", label: "Contacts", icon: Contact },
        { href: "/leads", label: "Leads", icon: UserSquare2, children: [{ href: "/leads", label: "All leads" }, { href: "/leads?status=NEW", label: "New" }, { href: "/leads/new", label: "New lead" }] },
      ],
    },
    {
      label: "Manage",
      items: [
        { href: "/approvals", label: "Approvals", icon: CheckSquare },
        { href: "/reviews", label: "Pipeline review", icon: ClipboardList, children: [{ href: "/reviews", label: "Current review" }, { href: "/reviews/history", label: "Past reviews" }] },
      ],
    },
  ];
  if (role === "SALES_HEAD") groups[1]!.items.push({ href: "/admin/targets", label: "Targets", icon: Target });
  if (role === "ADMIN")
    groups.push({
      label: "Admin",
      items: [
        { href: "/admin/users", label: "Users", icon: Users },
        { href: "/admin/lookups", label: "Master data", icon: Settings2 },
        { href: "/admin/products", label: "Products", icon: Package },
        { href: "/admin/approval-rules", label: "Approval rules", icon: ShieldCheck },
        { href: "/admin/targets", label: "Targets", icon: Target },
        { href: "/admin/audit", label: "Audit log", icon: ScrollText },
      ],
    });
  return groups;
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

/** Which leaf of an item the current URL matches: the most specific href whose path and query parameters are all present. */
function matchLeaf(leaves: Leaf[], pathname: string, params: URLSearchParams): string | null {
  let best: { href: string; score: number } | null = null;
  for (const l of leaves) {
    const [path, qs] = l.href.split("?");
    if (pathname !== path) continue;
    const want = new URLSearchParams(qs ?? "");
    let ok = true;
    for (const [k, v] of want) if (params.get(k) !== v) ok = false;
    if (!ok) continue;
    const score = [...want.keys()].length;
    if (!best || score > best.score) best = { href: l.href, score };
  }
  return best?.href ?? null;
}

const cardActive = "data-active:bg-card data-active:text-foreground data-active:font-medium data-active:shadow-card data-active:ring-1 data-active:ring-border";

function NavItem({ item, pathname, params, filter }: { item: Item; pathname: string; params: URLSearchParams; filter: string }) {
  const inSection = pathname === item.href || pathname.startsWith(item.href + "/") || (item.children?.some((c) => pathname === c.href.split("?")[0]) ?? false);
  const activeLeaf = item.children ? matchLeaf(item.children, pathname, params) ?? (inSection ? item.children[0]!.href : null) : null;
  const [open, setOpen] = useState(true);
  const q = filter.trim().toLowerCase();
  const children = item.children?.filter((c) => !q || c.label.toLowerCase().includes(q)) ?? [];
  if (q && !item.label.toLowerCase().includes(q) && children.length === 0) return null;
  const show = open || !!q;
  return (
    <SidebarMenuItem>
      {item.children ? (
        <SidebarMenuButton isActive={inSection} tooltip={item.label} onClick={() => setOpen((o) => !o)} className={cn("h-10 rounded-lg px-3 text-[15px]", cardActive)} aria-expanded={show}>
          <item.icon />
          <span className="flex-1">{item.label}</span>
          {show ? <ChevronDown className="text-muted-foreground" /> : <ChevronRight className="text-muted-foreground" />}
        </SidebarMenuButton>
      ) : (
        <SidebarMenuButton asChild isActive={inSection} tooltip={item.label} className={cn("h-10 rounded-lg px-3 text-[15px]", cardActive)}>
          <Link href={item.href}>
            <item.icon />
            <span className="flex-1">{item.label}</span>
            <ChevronRight className="text-muted-foreground" />
          </Link>
        </SidebarMenuButton>
      )}
      {item.children && show && (
        <SidebarMenuSub className="mx-5 mt-1 gap-0.5 border-border px-3">
          {children.map((c) => (
            <SidebarMenuSubItem key={c.href}>
              <SidebarMenuSubButton asChild isActive={activeLeaf === c.href} className={cn("h-9 rounded-lg px-3 text-[15px] text-foreground-secondary hover:bg-sidebar-hover hover:text-foreground", cardActive)}>
                <Link href={c.href}><span>{c.label}</span></Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}

export function AppShell({ children, sidebarOpen, pendingApprovals = 0 }: { children: ReactNode; sidebarOpen: boolean; pendingApprovals?: number }) {
  const actor = useActor();
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [filter, setFilter] = useState("");
  const groups = useMemo(() => navFor(actor.role, actor.id), [actor.role, actor.id]);
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
        <SidebarHeader className="gap-4 px-5 pt-5 pb-2">
          <Link href={home} className="flex items-center overflow-hidden" aria-label="Progression CRM home">
            <Logo height={28} className="group-data-[collapsible=icon]:hidden" />
            <Logo variant="mark" height={24} className="hidden group-data-[collapsible=icon]:block" />
          </Link>
          <div className="relative group-data-[collapsible=icon]:hidden">
            <Filter className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter navigator" aria-label="Filter navigator" className="h-10 rounded-xl bg-background pl-9" />
          </div>
        </SidebarHeader>
        <SidebarContent className="px-3">
          {groups.map((g) => (
            <SidebarGroup key={g.label} className="py-1">
              <SidebarGroupLabel className="h-8 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{g.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {g.items.map((it) => <NavItem key={it.href} item={it} pathname={pathname} params={params} filter={filter} />)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
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
