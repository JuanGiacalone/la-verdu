import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext.js";
import { Layout } from "./components/Layout.js";
import { AlertsPage } from "./pages/AlertsPage.js";
import { AuditPage } from "./pages/AuditPage.js";
import { AvailabilityPage } from "./pages/AvailabilityPage.js";
import { BranchesPage } from "./pages/BranchesPage.js";
import { CatalogPage } from "./pages/CatalogPage.js";
import { ConfigPage } from "./pages/ConfigPage.js";
import { ConversationsPage } from "./pages/ConversationsPage.js";
import { CustomersPage } from "./pages/CustomersPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { OrdersPage } from "./pages/OrdersPage.js";
import { PrintingPage } from "./pages/PrintingPage.js";
import { StaffPage } from "./pages/StaffPage.js";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-6">Cargando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/catalog" element={<CatalogPage />} />
            <Route path="/branches" element={<BranchesPage />} />
            <Route path="/staff" element={<StaffPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/availability" element={<AvailabilityPage />} />
            <Route path="/conversations" element={<ConversationsPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/printing" element={<PrintingPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/config" element={<ConfigPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
