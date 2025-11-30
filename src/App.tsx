import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { useAuth } from "./hooks/useAuth";
import Index from "./pages/Index";
import Claims from "./pages/Claims";
import ClaimDetail from "./pages/ClaimDetail";
import Tasks from "./pages/Tasks";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import Auth from "./pages/Auth";
import ClientPortal from "./pages/ClientPortal";
import ContractorPortal from "./pages/ContractorPortal";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, userRole, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user, userRole, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  // Redirect based on role
  if (user && userRole === "client") {
    return (
      <Routes>
        <Route path="/auth" element={<Navigate to="/client-portal" replace />} />
        <Route path="/client-portal" element={<ClientPortal />} />
        <Route path="*" element={<Navigate to="/client-portal" replace />} />
      </Routes>
    );
  }

  if (user && userRole === "contractor") {
    return (
      <Routes>
        <Route path="/auth" element={<Navigate to="/contractor-portal" replace />} />
        <Route path="/contractor-portal" element={<ContractorPortal />} />
        <Route path="*" element={<Navigate to="/contractor-portal" replace />} />
      </Routes>
    );
  }

  // Admin and staff routes
  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/" replace /> : <Auth />} />
      <Route path="/" element={<ProtectedRoute allowedRoles={["admin", "staff"]}><Index /></ProtectedRoute>} />
      <Route path="/claims" element={<ProtectedRoute allowedRoles={["admin", "staff"]}><Claims /></ProtectedRoute>} />
      <Route path="/claims/:id" element={<ProtectedRoute allowedRoles={["admin", "staff"]}><ClaimDetail /></ProtectedRoute>} />
      <Route path="/tasks" element={<ProtectedRoute allowedRoles={["admin", "staff"]}><Tasks /></ProtectedRoute>} />
      <Route path="/clients" element={<ProtectedRoute allowedRoles={["admin", "staff"]}><Clients /></ProtectedRoute>} />
      <Route path="/clients/:id" element={<ProtectedRoute allowedRoles={["admin", "staff"]}><ClientDetail /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <div className="dark">
          <AppLayout>
            <AppRoutes />
          </AppLayout>
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
