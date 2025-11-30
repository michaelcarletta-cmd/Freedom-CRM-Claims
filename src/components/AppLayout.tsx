import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { NotificationsBar } from "./NotificationsBar";
import { ReactNode, useEffect } from "react";
import { useLocation } from "react-router-dom";

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayoutContent = ({ children }: AppLayoutProps) => {
  const { setOpen, isMobile } = useSidebar();
  const location = useLocation();

  // Close sidebar on navigation
  useEffect(() => {
    // Always close on mobile, optionally close on desktop
    if (isMobile) {
      setOpen(false);
    }
  }, [location.pathname, isMobile, setOpen]);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b border-border bg-card flex items-center px-4 sticky top-0 z-10">
          <SidebarTrigger />
          <div className="ml-4 flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Freedom Claims CRM</span>
          </div>
        </header>
        <main className="flex-1 p-6 animate-fade-in">
          <NotificationsBar />
          {children}
        </main>
      </div>
    </div>
  );
};

export const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <SidebarProvider defaultOpen>
      <AppLayoutContent>{children}</AppLayoutContent>
    </SidebarProvider>
  );
};
