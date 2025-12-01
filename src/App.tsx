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
import Settings from "./pages/Settings";
import Networking from "./pages/Networking";
import Templates from "./pages/Templates";
import Sales from "./pages/Sales";
import Auth from "./pages/Auth";
import ClientPortal from "./pages/ClientPortal";
import ContractorPortal from "./pages/ContractorPortal";
import ReferrerPortal from "./pages/ReferrerPortal";
import Sign from "./pages/Sign";
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

  // Public routes that don't require authentication
  const publicRoutes = (
    <>
      <Route path="/auth" element={user ? <Navigate to="/" replace /> : <Auth />} />
      <Route path="/sign" element={<Sign />} />
    </>
  );

  // Redirect based on role
  if (user && userRole === "client") {
    return (
      <Routes>
        {publicRoutes}
        <Route path="/client-portal" element={<ClientPortal />} />
        <Route path="*" element={<Navigate to="/client-portal" replace />} />
      </Routes>
    );
  }

  if (user && userRole === "contractor") {
    return (
      <Routes>
        {publicRoutes}
        <Route path="/contractor-portal" element={<ContractorPortal />} />
        <Route path="*" element={<Navigate to="/contractor-portal" replace />} />
      </Routes>
    );
  }

  if (user && userRole === "referrer") {
    return (
      <Routes>
        {publicRoutes}
        <Route path="/referrer-portal" element={<ReferrerPortal />} />
        <Route path="*" element={<Navigate to="/referrer-portal" replace />} />
      </Routes>
    );
  }

  // Admin and staff routes
  return (
    <Routes>
      {publicRoutes}
      <Route path="/" element={<ProtectedRoute allowedRoles={["admin", "staff"]}><AppLayout><Index /></AppLayout></ProtectedRoute>} />
      <Route path="/claims" element={<ProtectedRoute allowedRoles={["admin", "staff"]}><AppLayout><Claims /></AppLayout></ProtectedRoute>} />
      <Route path="/claims/:id" element={<ProtectedRoute allowedRoles={["admin", "staff"]}><AppLayout><ClaimDetail /></AppLayout></ProtectedRoute>} />
      <Route path="/tasks" element={<ProtectedRoute allowedRoles={["admin", "staff"]}><AppLayout><Tasks /></AppLayout></ProtectedRoute>} />
      <Route path="/clients" element={<ProtectedRoute allowedRoles={["admin", "staff"]}><AppLayout><Clients /></AppLayout></ProtectedRoute>} />
      <Route path="/clients/:id" element={<ProtectedRoute allowedRoles={["admin", "staff"]}><AppLayout><ClientDetail /></AppLayout></ProtectedRoute>} />
      <Route path="/networking" element={<ProtectedRoute allowedRoles={["admin", "staff"]}><AppLayout><Networking /></AppLayout></ProtectedRoute>} />
      <Route path="/sales" element={<ProtectedRoute allowedRoles={["admin", "staff"]}><AppLayout><Sales /></AppLayout></ProtectedRoute>} />
      <Route path="/templates" element={<ProtectedRoute allowedRoles={["admin", "staff"]}><AppLayout><Templates /></AppLayout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute allowedRoles={["admin", "staff"]}><AppLayout><Settings /></AppLayout></ProtectedRoute>} />
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
          <AppRoutes />
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
