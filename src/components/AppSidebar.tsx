import { Home, FileText, CheckSquare, Inbox, Users, Network, DollarSign, FileStack, Settings } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import logo from "@/assets/freedom-claims-logo.svg";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "Claims", url: "/claims", icon: FileText },
  { title: "Tasks", url: "/tasks", icon: CheckSquare },
  { title: "Inbox", url: "/inbox", icon: Inbox },
  { title: "Clients", url: "/clients", icon: Users },
  { title: "Networking", url: "/networking", icon: Network },
  { title: "Sales", url: "/sales", icon: DollarSign },
  { title: "Templates", url: "/templates", icon: FileStack },
  { title: "Settings", url: "/settings", icon: Settings },
];

const accountItems: any[] = [];

export function AppSidebar() {
  const { open } = useSidebar();

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <SidebarContent>
        <div className="px-4 py-4 flex items-center gap-3">
          <img src={logo} alt="Freedom Claims" className="h-10 w-auto" />
          {open && (
            <h2 className="font-bold text-lg text-sidebar-primary">
              Freedom Claims
            </h2>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink 
                      to={item.url} 
                      end={item.url === "/"}
                      className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
