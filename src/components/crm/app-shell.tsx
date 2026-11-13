"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { Briefcase, Building2, CheckSquare, ClipboardList, Contact, Home, KeyRound, ListChecks, LogOut, Moon, Package, ScrollText, Settings2, ShieldCheck, Sun, Target, Users, UserSquare2 } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
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

export function AppShell({ children, sidebarOpen }: { children: ReactNode; sidebarOpen: boolean }) {
  const actor = useActor();
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const groups = navFor(actor.role);

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
        <SidebarHeader className="h-14 justify-center px-3">
          <Link href={actor.role === "PRESALES" || actor.role === "PURCHASE" ? "/my-work" : "/home"} className="flex items-center gap-2 overflow-hidden" aria-label="Progression CRM home">
            <Logo variant="mark" height={26} className="shrink-0" />
            <span className="truncate text-[15px] font-semibold tracking-tight text-sidebar-foreground group-data-[collapsible=icon]:hidden">Progression CRM</span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          {groups.map((g) => (
            <SidebarGroup key={g.label}>
              <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
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
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg" tooltip={actor.fullName} aria-label="Account menu" className="data-[state=open]:bg-sidebar-accent">
                    <Avatar className="size-7 rounded-md">
                      <AvatarFallback className="rounded-md bg-primary/15 text-xs font-semibold text-primary">{initials(actor.fullName)}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                      <span className="truncate text-sm font-medium">{actor.fullName}</span>
                      <span className="truncate text-xs text-muted-foreground">{ROLE_LABEL[actor.role]}</span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="text-sm font-medium">{actor.fullName}</div>
                    <div className="text-xs text-muted-foreground">{actor.email}</div>
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
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/90 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <div className="flex-1" />
          <Button variant="ghost" size="icon-sm" aria-label="Toggle dark mode" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
            <Sun className="hidden dark:block" />
            <Moon className="block dark:hidden" />
          </Button>
        </header>
        <main className={cn("mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6")}>{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
