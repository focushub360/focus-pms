import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, FY, hasPerm, hasAnyPerm, monthLabel } from "@/lib/api";
import { Gauge } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Select } from "@/components/dash/ui";
import MyPerformance from "@/components/dash/MyPerformance";
import DepartmentPanel from "@/components/dash/DepartmentPanel";
import AdminPanel from "@/components/dash/AdminPanel";

const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"];

export default function Dashboard() {
  const { user } = useAuth();
  const deptView = true;
  const adminView = hasPerm(user, "SYSTEM_ADMIN");
  const tabs = [
    ...(user.is_sales_contributor || !hasAnyPerm(user, ["HOD_VIEW", "MANAGEMENT_BOARD_VIEW"]) ? [{ id: "me", label: "My Performance" }] : []),
    ...(deptView ? [{ id: "dept", label: "Department" }] : []),
    { id: "employee", label: "Employee View", show: hasAnyPerm(user, ["TARGETS_CONFIGURE", "HOD_VIEW", "MANAGEMENT_BOARD_VIEW", "TEAM_PERFORMANCE_VIEW"]) },
    ...(adminView ? [{ id: "admin", label: "System" }] : []),
  ].filter((t) => t.show !== false);
  const [tab, setTab] = useState(tabs[0].id);
  const [fy] = useState(FY);
  const [period, setPeriod] = useState("");
  const [employees, setEmployees] = useState([]);
  const [empId, setEmpId] = useState("");

  useEffect(() => { api.get("/meta/employees").then((r) => { setEmployees(r.data); setEmpId((p) => p || r.data.find((e) => e.id !== user.id)?.id || r.data[0]?.id || ""); }).catch(() => { }); }, [user.id]);

  const filters = { fy, month: period.startsWith("M:") ? period.slice(2) : "", quarter: period.startsWith("Q:") ? period.slice(2) : "" };
  const periodOpts = [{ value: "", label: "Full year" }, ...["Q1", "Q2", "Q3", "Q4"].map((q) => ({ value: `Q:${q}`, label: q })), ...MONTHS.map((m) => ({ value: `M:${m}`, label: `${monthLabel(m)} ${m.slice(0, 4)}` }))];

  return (
    <div className="space-y-5" data-testid="dashboard-page">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#262262] via-[#264494] to-[#4F46E5] bg-clip-text text-transparent">
            Welcome, {user?.name?.split(" ")[0]}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">
            Live figures from opportunities, leads, activities, and approved scorecards.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {hasAnyPerm(user, ["MANAGEMENT_BOARD_VIEW", "HOD_VIEW", "SYSTEM_ADMIN", "MIS_REPORT_VIEW"]) && (
            <Link
              to="/app/targets?tab=command-center"
              data-testid="open-command-center-btn"
              className="fe-btn-primary text-xs py-1.5 px-3"
            >
              <Gauge size={14} /> Command Center
            </Link>
          )}
          <Select value={fy} onChange={() => { }} testid="filter-fy" options={[{ value: FY, label: "FY 2026–27" }]} />
          <Select value={period} onChange={setPeriod} testid="filter-period" options={periodOpts} />
          {tab === "employee" && <Select value={empId} onChange={setEmpId} testid="filter-employee" options={employees.map((e) => ({ value: e.id, label: e.name }))} />}
        </div>
      </div>

      {/* iOS Segmented Control Tabs */}
      <div className="p-1 bg-slate-200/60 backdrop-blur-md rounded-2xl inline-flex gap-1 max-w-full overflow-x-auto fe-scroll shadow-inner border border-slate-200/80" data-testid="dashboard-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            data-testid={`dash-tab-${t.id}`}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all duration-200 shrink-0 whitespace-nowrap active:scale-95 ${
              tab === t.id
                ? "bg-white text-[#262262] shadow-sm font-bold"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/40"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "me" && <MyPerformance filters={filters} />}
      {tab === "dept" && <DepartmentPanel filters={filters} onOpenEmployee={(id) => { setEmpId(id); setTab("employee"); }} />}
      {tab === "employee" && empId && <MyPerformance key={empId} userId={empId} filters={filters} />}
      {tab === "admin" && <AdminPanel />}
    </div>
  );
}
