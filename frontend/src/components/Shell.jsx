import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { GlobalSearch, Notifications } from "@/components/HeaderTools";
import { hasAnyPerm, hasPerm } from "@/lib/api";
import {
  LayoutDashboard, Users, Target, Briefcase, Megaphone,
  TrendingUp, Building2, ScrollText, LogOut, Settings, UserPlus, CalendarDays, ClipboardList, BarChart3
} from "lucide-react";

const NAV = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard, perms: null },
  { to: "/app/opportunities", label: "Opportunities", icon: TrendingUp, perms: ["SALES_OPPORTUNITY_MANAGE"] },
  { to: "/app/leads", label: "Leads", icon: Briefcase, perms: ["SALES_LEAD_MANAGE"] },
  { to: "/app/accounts", label: "Accounts", icon: Building2, perms: ["SALES_ACCOUNT_MANAGE"] },
  { to: "/app/campaigns", label: "Marketing", icon: Megaphone, perms: ["MARKETING_CAMPAIGN_MANAGE", "MARKETING_REPORT_VIEW"] },
  { to: "/app/calendar", label: "Calendar & Activities", icon: CalendarDays, perms: null },
  { to: "/app/daily-activity", label: "Daily Activity", icon: ClipboardList, perms: null },
  { to: "/app/reports", label: "Reports & Analytics", icon: BarChart3, perms: null },
  { to: "/app/targets", label: "Targets & KPIs", icon: Target, perms: ["TARGETS_VIEW", "TARGETS_CONFIGURE"] },
  { to: "/app/users", label: "User & Access", icon: UserPlus, perms: ["USER_ONBOARDING_ADMIN", "USER_VIEW"] },
  { to: "/app/audit", label: "Audit Log", icon: ScrollText, perms: ["AUDIT_VIEW"] },
];

export default function Shell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const visible = NAV.filter((item) => !item.perms || hasAnyPerm(user, item.perms));

  return (
    <div className="min-h-screen flex" style={{ background: "#F8F9FA" }}>
      <aside className="fe-sidebar w-64 flex flex-col fe-scroll" data-testid="app-sidebar">
        <div className="fe-sidebar-brand h-16 flex items-center gap-3 px-4">
          <div className="fe-brand-gear">FE</div>
          <div>
            <div className="text-white font-bold text-sm leading-tight">Focus Engineering</div>
            <div className="text-[11px] uppercase tracking-wider" style={{ color: "#51C5DC" }}>PMS</div>
          </div>
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1">
          {visible.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              data-testid={`nav-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              className={({ isActive }) =>
                `fe-nav-item flex items-center gap-3 px-3 py-2.5 rounded-md text-sm ${isActive ? "fe-nav-item-active" : ""}`
              }
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="px-2 pb-4">
          <button
            onClick={logout}
            data-testid="logout-btn"
            className="fe-nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm"
          >
            <LogOut size={18} /> <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6" data-testid="app-header">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">Sales &amp; Marketing Performance Management</div>
            <div className="text-base font-semibold" style={{ color: "#262262" }}>Focus PMS Console</div>
          </div>
          <div className="flex items-center gap-4">
            <GlobalSearch />
            <Notifications />
            <div className="text-xs text-slate-500 hidden lg:block">FY 2026-27</div>
            <div
              className="flex items-center gap-3 cursor-pointer"
              data-testid="user-menu"
              onClick={() => navigate("/app/profile")}
            >
              <div className="w-9 h-9 rounded-full bg-[#264494] text-white flex items-center justify-center font-semibold text-sm">
                {(user?.name || "?").slice(0, 1)}
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-slate-800">{user?.name}</div>
                <div className="text-xs text-slate-500">{user?.designation}</div>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 p-6 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
