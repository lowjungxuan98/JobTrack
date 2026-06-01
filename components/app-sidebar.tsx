"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActivityIcon, BookOpenIcon, BriefcaseBusinessIcon, ChevronDownIcon, LayoutDashboardIcon } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type Role = { id: string; name: string; slug: string; count: number };

export function AppSidebar({ roles }: { roles: Role[] }) {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader>
        <span className="px-2 py-1 text-sm font-semibold">Job Tracker</span>
      </SidebarHeader>
      <SidebarContent>
        {/* Dashboard nav item */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/"}>
                  <Link href="/">
                    <LayoutDashboardIcon />
                    Dashboard
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/jobops"}>
                  <Link href="/jobops">
                    <ActivityIcon />
                    JobOps
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/reference"}>
                  <Link href="/reference">
                    <BookOpenIcon />
                    API Reference
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Collapsible Roles group */}
        <SidebarGroup>
          <Collapsible.Root defaultOpen className="group/collapsible">
            <Collapsible.Trigger asChild>
              <SidebarGroupLabel className="cursor-pointer hover:text-sidebar-foreground">
                Roles
                <ChevronDownIcon className="ml-auto size-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
              </SidebarGroupLabel>
            </Collapsible.Trigger>
            <Collapsible.Content>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === "/jobs"}>
                      <Link href="/jobs">
                        <BriefcaseBusinessIcon />
                        All Jobs
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {roles.map((role) => (
                    <SidebarMenuItem key={role.id}>
                      <SidebarMenuButton asChild>
                        <Link href={`/jobs?role=${role.slug}`}>
                          <span className="capitalize">{role.name.replace(/_/g, " ")}</span>
                          <span className="ml-auto text-xs opacity-50">{role.count}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </Collapsible.Content>
          </Collapsible.Root>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
