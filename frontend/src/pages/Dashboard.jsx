import { useState } from "react";
import { FY, hasAnyPerm, monthLabel } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Select } from "@/components/dash/ui";
import MyPerformance from "@/components/dash/MyPerformance";
import CommandCenter from "@/pages/CommandCenter";

const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"];

export default function Dashboard() {
  const { user } = useAuth();
  const canCommandCenter = hasAnyPerm(user, ["MANAGEMENT_BOARD_VIEW", "HOD_VIEW", "SYSTEM_ADMIN", "MIS_REPORT_VIEW"]);
  const [fy] = useState(FY);
  const [period, setPeriod] = useState("");

  // Management, HOD, MIS & Admin see the full Command Center directly on Dashboard
  if (canCommandCenter) {
    return <CommandCenter />;
  }

  // Regular employees without executive permissions see their own scoped My Performance view
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
            Your personal targets, pipeline activities, and monthly scorecard progress.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Select value={fy} onChange={() => { }} testid="filter-fy" options={[{ value: FY, label: "FY 2026–27" }]} />
          <Select value={period} onChange={setPeriod} testid="filter-period" options={periodOpts} />
        </div>
      </div>

      <MyPerformance filters={filters} />
    </div>
  );
}
