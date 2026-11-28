import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, errMsg, hasPerm } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Panel } from "@/components/dash/ui";
import ScorecardTab from "@/components/targets/ScorecardTab";
import SalesTargetsTab from "@/components/targets/SalesTargetsTab";
import AssignmentsTab from "@/components/targets/AssignmentsTab";
import LibraryTab from "@/components/targets/LibraryTab";
// import CommandCenter from "@/pages/CommandCenter";
import { toast } from "sonner";

function ThresholdsTab() {
  const { user } = useAuth();
  const can = hasPerm(user, "TARGETS_CONFIGURE");
  const [t, setT] = useState(null);
  useEffect(() => { api.get("/settings/kpi-thresholds").then((r) => setT(r.data)); }, []);
  if (!t) return null;
  const save = async () => {
    try {
      await api.put("/settings/kpi-thresholds", {
        achieved: Number(t.achieved),
        on_track: Number(t.on_track),
        at_risk: Number(t.at_risk),
        achievement_cap: Number(t.achievement_cap ?? 120),
      });
      toast.success("Thresholds & cap saved");
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Panel title="KPI Status Thresholds & Achievement Cap" testid="thresholds-tab">
      <p className="text-sm text-slate-500 mb-4">Configure monthly status bands (On Track ≥ 100%, Watch ≥ 80%, below is At Risk) and weighted score achievement cap (default 120%).</p>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-w-3xl">
        {[["achieved", "On Track ≥"], ["on_track", "Watch ≥"], ["at_risk", "FY At Risk ≥"], ["achievement_cap", "Max Score Cap"]].map(([k, l]) => (
          <div key={k}><label className="fe-kpi-label">{l} (%)</label><input type="number" disabled={!can} className="fe-input mt-1" value={t[k] ?? (k === "achievement_cap" ? 120 : "")} onChange={(e) => setT({ ...t, [k]: e.target.value })} data-testid={`threshold-${k}`} /></div>))}
      </div>
      {can && <button className="fe-btn-primary mt-4" onClick={save} data-testid="save-thresholds">Save thresholds</button>}
    </Panel>
  );
}

export default function Targets() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [employees, setEmployees] = useState([]);
  const canConfig = hasPerm(user, "TARGETS_CONFIGURE");
  // const canCommandCenter = hasAnyPerm(user, ["MANAGEMENT_BOARD_VIEW", "HOD_VIEW", "SYSTEM_ADMIN", "MIS_REPORT_VIEW"]);
  const tabs = [
    { id: "scorecard", label: "KPI Scorecard" },
    // ...(canCommandCenter ? [{ id: "command-center", label: "Command Center" }] : []),
    { id: "targets", label: "Sales Targets" },
    ...(canConfig ? [{ id: "assignments", label: "KPI Assignments" }] : []),
    { id: "library", label: "KPI Library" },
    { id: "settings", label: "Thresholds" },
  ];
  const tab = tabs.find((t) => t.id === params.get("tab"))?.id || "scorecard";
  useEffect(() => { api.get("/meta/employees").then((r) => setEmployees(r.data)).catch(() => { }); }, []);

  return (
    <div className="space-y-5" data-testid="targets-page">
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-[#262262]">Targets &amp; KPIs</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">Configurable KPI library, management-approved targets, executive revenue command center and monthly scorecards.</p>
      </div>
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto fe-scroll pb-px" data-testid="targets-tabs">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setParams({ tab: t.id })} data-testid={`targets-tab-${t.id}`}
            className={`px-3.5 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === t.id ? "border-[#264494] text-[#264494] font-semibold" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{t.label}</button>
        ))}
      </div>
      {tab === "scorecard" && <ScorecardTab employees={employees} />}
      {/* {tab === "command-center" && <CommandCenter embedded />} */}
      {tab === "targets" && <SalesTargetsTab employees={employees} />}
      {tab === "assignments" && employees.length > 0 && <AssignmentsTab employees={employees} />}
      {tab === "library" && <LibraryTab />}
      {tab === "settings" && <ThresholdsTab />}
    </div>
  );
}
