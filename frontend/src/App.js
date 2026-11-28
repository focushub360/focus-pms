import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth";

import Login from "@/pages/Login";
import ChangePassword from "@/pages/ChangePassword";
import AcceptInvite from "@/pages/AcceptInvite";
import { ForgotPassword, ResetPassword } from "@/pages/PasswordRecovery";
import Shell from "@/components/Shell";
import Dashboard from "@/pages/Dashboard";
import Users from "@/pages/Users";
import Opportunities from "@/pages/Opportunities";
import CalendarPage from "@/pages/Calendar";
import DailyActivity from "@/pages/DailyActivity";
import Targets from "@/pages/Targets";
import Reports from "@/pages/Reports";
import { Leads, Accounts, Campaigns } from "@/pages/CrudPages";
import AuditLog from "@/pages/AuditLog";
import Profile from "@/pages/Profile";
import Projects from "@/pages/Projects";

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (user.must_change_password && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }
  return children;
}

function AppShellRoutes() {
  return (
    <Shell>
      <Routes>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="command-center" element={<Navigate to="/app/dashboard" replace />} />
        <Route path="opportunities" element={<Opportunities />} />
        <Route path="projects" element={<Projects />} />
        <Route path="leads" element={<Leads />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="daily-activity" element={<DailyActivity />} />
        <Route path="reports" element={<Reports />} />
        <Route path="targets" element={<Targets />} />
        <Route path="users" element={<Users />} />
        <Route path="audit" element={<AuditLog />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </Shell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/accept-invite/:token" element={<AcceptInvite />} />
          <Route path="/change-password" element={<Protected><ChangePassword /></Protected>} />
          <Route path="/app/*" element={<Protected><AppShellRoutes /></Protected>} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
