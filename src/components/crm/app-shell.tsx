"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { Briefcase, Building2, CheckSquare, ClipboardList, Contact, Home, KeyRound, ListChecks, LogOut, Moon, Package, ScrollText, Search, Settings2, ShieldCheck, Sun, Target, Users, UserSquare2 } from "lucide-react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
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

type Item = { href: string; label: string; icon: typeof Home; exact?: boolean };

function navFor(role: string): { label: string; items: Item[] }[] {
  if (role === "PRESALES" || role === "PURCHASE") {
    return [
      { label: "Work", items: [{ href: "/my-work", label: "My work", icon: ListChecks }, { href: "/deals", label: "Deals", icon: Briefcase }, { href: "/accounts", label: "Accounts", icon: Building2 }] },
    ];
  }
  const groups = [
    { label: "Sales", items: [{ href: "/home", label: "Home", icon: Home }, { href: "/deals", label: "Deals", icon: Briefcase }, { href: "/accounts", label: "Accounts", icon: Building2 }, { href: "/contacts", label: "Contacts", icon: Contact }, { href: "/leads", label: "Leads", icon: UserSquare2 }] },
    { label: "Manage", items: [{ href: "/approvals", label: "Approvals", icon: CheckSquare }, { href: "/reviews", label: "Pipeline review", icon: ClipboardList }] },
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
function searchTarget(pathname: string) {
  return SEARCHABLE.find((s) => pathname === s.href || pathname.startsWith(s.href + "/")) ?? SEARCHABLE[0]!;
}

function TopSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const target = searchTarget(pathname);
  return (
    <form
      role="search"
      className="relative hidden sm:block"
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        router.push(term ? `${target.href}?q=${encodeURIComponent(term)}` : target.href);
        setQ("");
      }}
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${target.label}…`} aria-label="Search" className="h-8 w-64 pl-8" />
    </form>
  );
}

export function AppShell({ children, sidebarOpen }: { children: ReactNode; sidebarOpen: boolean }) {
  const actor = useActor();
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const groups = navFor(actor.role);
  const home = actor.role === "PRESALES" || actor.role === "PURCHASE" ? "/my-work" : "/home";

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
    <SidebarProvider defaultOpen={sidebarOpen} className="flex-col">
      <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
        <SidebarTrigger aria-label="Toggle sidebar" />
        <Link href={home} className="flex items-center gap-2 pl-1" aria-label="Progression CRM home">
          <Logo variant="mark" height={22} className="shrink-0" />
          <span className="text-sm font-medium tracking-tight text-foreground">Progression CRM</span>
        </Link>
        <div className="flex-1" />
        <TopSearch />
        <Button variant="ghost" size="icon-sm" aria-label="Toggle dark mode" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          <Sun className="hidden dark:block" />
          <Moon className="block dark:hidden" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Account menu" className="rounded-full">
              <Avatar className="size-7">
                <AvatarFallback className="bg-selected text-xs font-medium text-selected-foreground">{initials(actor.fullName)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="text-sm font-medium">{actor.fullName}</div>
              <div className="text-xs text-muted-foreground">{actor.email}</div>
              <div className="text-xs text-muted-foreground">{ROLE_LABEL[actor.role]}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/account"><KeyRound /> Change password</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              {resolvedTheme === "dark" ? <Sun /> : <Moon />} {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut}><LogOut /> Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className="flex min-h-0 flex-1">
        <Sidebar collapsible="icon" className="top-12 h-[calc(100svh-3rem)]">
          <SidebarContent className="pt-2">
            {groups.map((g) => (
              <SidebarGroup key={g.label}>
                <SidebarGroupLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">{g.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {g.items.map((it) => {
                      const active = it.exact ? pathname === it.href : pathname === it.href || pathname.startsWith(it.href + "/");
                      return (
                        <SidebarMenuItem key={it.href}>
                          <SidebarMenuButton asChild isActive={active} tooltip={it.label}>
                            <Link href={it.href}>
                              <it.icon />
                              <span>{it.label}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>
        </Sidebar>
        <SidebarInset className="min-w-0">
          <main className={cn("mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6")}>{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
