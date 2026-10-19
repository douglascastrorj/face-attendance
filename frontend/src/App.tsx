import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { AuthProvider, useAuth } from './lib/auth';
import { ClockInPage } from './pages/ClockInPage';
import { DashboardPage } from './pages/DashboardPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { EnrollPage } from './pages/EnrollPage';
import { HistoryPage } from './pages/HistoryPage';
import { LoginPage } from './pages/LoginPage';

function RequireAdmin({ children }: { children: ReactNode }) {
  const { ready, authenticated } = useAuth();
  const location = useLocation();
  if (!ready) return <Spinner label="Carregando…" />;
  if (!authenticated) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Layout />}>
            {/* Bater Ponto é público (quiosque); demais páginas são administrativas. */}
            <Route path="/ponto" element={<ClockInPage />} />
            <Route path="/" element={<RequireAdmin><DashboardPage /></RequireAdmin>} />
            <Route path="/funcionarios" element={<RequireAdmin><EmployeesPage /></RequireAdmin>} />
            <Route path="/funcionarios/novo" element={<RequireAdmin><EnrollPage /></RequireAdmin>} />
            <Route path="/historico" element={<RequireAdmin><HistoryPage /></RequireAdmin>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
