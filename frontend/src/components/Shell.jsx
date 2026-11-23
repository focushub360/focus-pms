import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { GlobalSearch, Notifications } from "@/components/HeaderTools";
import { hasAnyPerm } from "@/lib/api";
import {
  LayoutDashboard, Target, Briefcase, Megaphone,
  TrendingUp, Building2, ScrollText, LogOut, UserPlus,
  CalendarDays, ClipboardList, BarChart3, Menu, X, ChevronRight, User,
  PanelLeftClose, PanelLeftOpen
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
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("tb_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("tb_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  // Close mobile drawer whenever route changes
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Lock background scroll when drawer is open on mobile
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  const visible = NAV.filter((item) => !item.perms || hasAnyPerm(user, item.perms));

  // High-frequency navigation targets for bottom tab bar on mobile
  const bottomNavItems = [
    { to: "/app/dashboard", label: "Dash", icon: LayoutDashboard },
    { to: "/app/opportunities", label: "Opps", icon: TrendingUp },
    { to: "/app/daily-activity", label: "Daily", icon: ClipboardList },
    { to: "/app/calendar", label: "Calendar", icon: CalendarDays },
  ];

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-[#0F172A]">
      {/* ────────────────── DESKTOP SIDEBAR (>= 1024px) ────────────────── */}
      <aside
        className={`hidden lg:flex flex-col fe-sidebar fixed inset-y-0 left-0 h-screen border-r border-[#342F7C]/60 z-30 select-none shadow-2xl transition-all duration-300 ease-in-out ${
          collapsed ? "w-20" : "w-64"
        }`}
        data-testid="app-sidebar"
      >
        {/* Brand Header — Fixed at Top with iOS styling & Collapse Toggle */}
        <div
          className={`h-16 flex items-center shrink-0 bg-white/95 backdrop-blur-md border-b border-slate-200/80 transition-all duration-300 ${
            collapsed ? "justify-center px-2" : "justify-between px-4"
          }`}
          data-testid="sidebar-brand-header"
        >
          {collapsed ? (
            <button
              onClick={() => navigate("/app/dashboard")}
              className="p-1 rounded-2xl hover:bg-slate-100 transition-transform active:scale-95"
              title="TaskBoard Dashboard"
            >
              <img
                src="/favicon.png"
                alt="TaskBoard"
                className="h-10 w-10 object-contain rounded-xl p-1 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/60 shadow-xs"
              />
            </button>
          ) : (
            <div
              onClick={() => navigate("/app/dashboard")}
              className="flex items-center cursor-pointer transition-transform active:scale-98"
              title="TaskBoard Dashboard"
            >
              <img
                src="/logo.png"
                alt="TaskBoard"
                className="h-9 w-auto max-w-[170px] object-contain"
              />
            </div>
          )}

          {/* Collapse/Expand Toggle Button */}
          {!collapsed && (
            <button
              onClick={toggleCollapse}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all active:scale-90 cursor-pointer"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              data-testid="collapse-sidebar-btn"
            >
              <PanelLeftClose size={18} />
            </button>
          )}
        </div>

        {/* Collapsed Mode Expand Button Pill */}
        {collapsed && (
          <div className="pt-2.5 pb-1 flex justify-center">
            <button
              onClick={toggleCollapse}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-all active:scale-90 cursor-pointer"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen size={18} />
            </button>
          </div>
        )}

        {/* Navigation Items — Standard scrollable list independent of page body */}
        <nav className="flex-1 py-3 px-2 space-y-1.5 overflow-y-auto fe-scroll overscroll-contain">
          {visible.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              data-testid={`nav-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              className={({ isActive }) =>
                `group relative flex items-center rounded-2xl text-sm font-medium transition-all duration-200 ${
                  collapsed ? "justify-center p-3" : "gap-3 px-3.5 py-2.5"
                } ${
                  isActive
                    ? "fe-nav-item-active"
                    : "text-slate-300 hover:text-white hover:bg-white/10 active:scale-95"
                }`
              }
            >
              <item.icon size={20} className="shrink-0 transition-transform group-hover:scale-110" />
              {!collapsed && <span className="truncate">{item.label}</span>}

              {/* iOS Floating Tooltip when Collapsed */}
              {collapsed && (
                <span className="fixed left-20 ml-2 px-3 py-1.5 rounded-xl bg-slate-900/95 backdrop-blur-md text-white text-xs font-semibold shadow-2xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap border border-white/10">
                  {item.label}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User Card & Sign out — Fixed at Bottom with iOS Styling */}
        <div className={`p-2.5 border-t border-[#342F7C]/60 shrink-0 bg-[#1E1A4F]/70 backdrop-blur-md ${collapsed ? "flex flex-col items-center gap-2" : ""}`}>
          <div
            onClick={() => navigate("/app/profile")}
            className={`flex items-center rounded-2xl hover:bg-white/10 cursor-pointer transition-all mb-1 active:scale-95 group relative ${
              collapsed ? "p-1.5 justify-center" : "gap-3 p-2"
            }`}
            title="View Profile"
          >
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#007AFF] to-[#5856D6] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm border border-white/20">
              {(user?.name || "?").slice(0, 1).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white truncate">{user?.name}</div>
                <div className="text-[11px] text-slate-300 truncate">{user?.designation || "Team Member"}</div>
              </div>
            )}
            {collapsed && (
              <span className="fixed left-20 ml-2 px-3 py-1.5 rounded-xl bg-slate-900/95 backdrop-blur-md text-white text-xs font-semibold shadow-2xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap border border-white/10">
                {user?.name || "Profile"}
              </span>
            )}
          </div>
          <button
            onClick={logout}
            data-testid="logout-btn"
            className={`flex items-center rounded-xl text-xs font-medium text-rose-300 hover:text-white hover:bg-rose-500/20 transition-all cursor-pointer active:scale-95 ${
              collapsed ? "p-2.5 justify-center w-full" : "w-full gap-2.5 px-3 py-2"
            }`}
            title="Sign out"
          >
            <LogOut size={16} /> {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* ────────────────── MOBILE & TABLET TOP HEADER (< 1024px) ────────────────── */}
      <header
        className="lg:hidden h-14 sm:h-16 bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-4 sticky top-0 z-30 shadow-xs"
        data-testid="mobile-app-header"
      >
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-1.5 sm:p-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Open menu"
            data-testid="mobile-menu-btn"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center cursor-pointer" onClick={() => navigate("/app/dashboard")}>
            <img
              src="/logo.png"
              alt="TaskBoard"
              className="h-7 sm:h-8 w-auto max-w-[160px] sm:max-w-[200px] object-contain"
            />
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <GlobalSearch />
          <Notifications />
          <div
            className="w-8 h-8 rounded-full bg-[#264494] text-white flex items-center justify-center font-bold text-xs cursor-pointer ml-1 shadow-2xs"
            onClick={() => navigate("/app/profile")}
            title="Profile"
          >
            {(user?.name || "?").slice(0, 1).toUpperCase()}
          </div>
        </div>
      </header>

      {/* ────────────────── MOBILE SLIDE-OVER DRAWER (< 1024px) ────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer content */}
          <div className="relative w-72 sm:w-80 max-w-[85vw] bg-[#262262] text-white flex flex-col h-full shadow-2xl z-10 fe-scroll">
            {/* Drawer Header */}
            <div className="h-16 flex items-center justify-between px-4 bg-white border-b border-slate-200">
              <img
                src="/logo.png"
                alt="TaskBoard"
                className="h-8 w-auto max-w-[190px] object-contain"
              />
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>

            {/* User Profile Banner in Drawer */}
            <div
              onClick={() => {
                setDrawerOpen(false);
                navigate("/app/profile");
              }}
              className="p-3.5 mx-2 my-2 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between cursor-pointer hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-[#51C5DC] text-[#262262] flex items-center justify-center font-bold text-sm shrink-0">
                  {(user?.name || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">{user?.name}</div>
                  <div className="text-[11px] text-slate-300 truncate">{user?.designation || "Team Member"}</div>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-400 shrink-0" />
            </div>

            {/* Navigation links */}
            <nav className="flex-1 px-2 py-2 space-y-1 overflow-y-auto fe-scroll">
              <div className="px-3 py-1.5 text-[10px] uppercase font-bold tracking-widest text-[#51C5DC]">
                Navigation
              </div>
              {visible.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setDrawerOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? "bg-[#264494] text-white shadow-sm font-semibold"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`
                  }
                >
                  <item.icon size={18} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </nav>

            {/* Drawer Footer with Logout */}
            <div className="p-3 border-t border-[#342F7C] bg-[#1E1A4F]/80 pb-safe">
              <button
                onClick={() => {
                  setDrawerOpen(false);
                  logout();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 transition-all"
              >
                <LogOut size={16} /> <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── MAIN CONTENT AREA ────────────────── */}
      <div className={`flex flex-col min-w-0 min-h-screen transition-all duration-300 ease-in-out ${
        collapsed ? "lg:pl-20" : "lg:pl-64"
      }`}>
        {/* Desktop Header (>= 1024px) with iOS Frosted Glass */}
        <header
          className="hidden lg:flex h-16 bg-white/80 backdrop-blur-xl border-b border-slate-200/70 items-center justify-between px-6 sticky top-0 z-20 shadow-xs"
          data-testid="app-header"
        >
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
              Performance &amp; Tasks
            </div>
            <div className="text-base font-bold bg-gradient-to-r from-[#262262] via-[#264494] to-[#4F46E5] bg-clip-text text-transparent">
              TaskBoard Console
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <GlobalSearch />
            <Notifications />
            <div className="text-xs font-semibold px-3 py-1 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border border-blue-200/60 shadow-xs">
              FY 2026-27
            </div>
            <div
              className="flex items-center gap-3 cursor-pointer pl-2 py-1 pr-2 rounded-2xl hover:bg-slate-100/80 transition-all active:scale-98"
              data-testid="user-menu"
              onClick={() => navigate("/app/profile")}
            >
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#007AFF] to-[#5856D6] text-white flex items-center justify-center font-bold text-sm shadow-sm border border-white/30">
                {(user?.name || "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-slate-800 leading-tight">{user?.name}</div>
                <div className="text-xs text-slate-500 leading-tight">{user?.designation}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content Viewport */}
        <main className="flex-1 p-3.5 sm:p-5 lg:p-8 pb-28 lg:pb-8 max-w-full overflow-x-hidden">
          {children}
        </main>
      </div>

      {/* ────────────────── MOBILE FLOATING DOCK (< 1024px) ────────────────── */}
      <nav
        className="lg:hidden fixed bottom-3 left-3 right-3 z-40 bg-white/90 backdrop-blur-2xl border border-slate-200/70 shadow-2xl rounded-3xl px-2 py-1.5 flex justify-around items-center"
        data-testid="mobile-bottom-nav"
      >
        {bottomNavItems.map((item) => {
          const isActive = location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl text-[10px] font-semibold transition-all active:scale-95 min-w-[56px] ${
                isActive
                  ? "text-[#007AFF] bg-blue-50/80 font-bold shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <item.icon size={20} className={isActive ? "text-[#007AFF]" : "text-slate-500"} />
              <span className="mt-0.5">{item.label}</span>
            </NavLink>
          );
        })}

        {/* More / Menu Drawer Toggle */}
        <button
          onClick={() => setDrawerOpen(true)}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl text-[10px] font-semibold transition-all active:scale-95 min-w-[56px] ${
            drawerOpen ? "text-[#007AFF] bg-blue-50/80 font-bold" : "text-slate-500 hover:text-slate-800"
          }`}
          aria-label="Open full menu"
        >
          <Menu size={20} className={drawerOpen ? "text-[#007AFF]" : "text-slate-500"} />
          <span className="mt-0.5">More</span>
        </button>
      </nav>
    </div>
  );
}
