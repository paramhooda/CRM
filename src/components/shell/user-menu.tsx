"use client";
import { LogOut, User as UserIcon } from "lucide-react";
import { Avatar } from "@/components/crm/badges";
import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator } from "@/components/ui/dropdown";
import { logout } from "@/server/actions/auth";
import { ROLE_LABEL } from "@/lib/constants";
import type { Role } from "@prisma/client";

export function UserMenu({ user }: { user: { name: string; email: string; role: Role; title: string | null } }) {
  return (
    <Dropdown>
      <DropdownTrigger className="rounded-full p-0.5 hover:bg-surface-hover cursor-pointer" aria-label="Account menu">
        <Avatar name={user.name} className="size-7" />
      </DropdownTrigger>
      <DropdownContent className="w-60">
        <DropdownLabel>
          <span className="block text-[13px] font-medium text-ink">{user.name}</span>
          <span className="block">{user.email}</span>
          <span className="block">{ROLE_LABEL[user.role]}{user.title ? ` · ${user.title}` : ""}</span>
        </DropdownLabel>
        <DropdownSeparator />
        <DropdownItem disabled>
          <UserIcon /> Profile
        </DropdownItem>
        <DropdownItem onSelect={() => logout()}>
          <LogOut /> Sign out
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
