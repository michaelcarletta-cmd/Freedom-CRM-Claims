import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { NotificationsBar } from "./NotificationsBar";
import { ReactNode } from "react";

interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <SidebarProvider defaultOpen>
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
    </SidebarProvider>
  );
};
