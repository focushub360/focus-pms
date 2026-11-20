import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, errMsg, hasPerm } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Panel } from "@/components/dash/ui";
import ScorecardTab from "@/components/targets/ScorecardTab";
import SalesTargetsTab from "@/components/targets/SalesTargetsTab";
import AssignmentsTab from "@/components/targets/AssignmentsTab";
import LibraryTab from "@/components/targets/LibraryTab";
import { toast } from "sonner";

function ThresholdsTab() {
  const { user } = useAuth();
  const can = hasPerm(user, "TARGETS_CONFIGURE");
  const [t, setT] = useState(null);
  useEffect(() => { api.get("/settings/kpi-thresholds").then((r) => setT(r.data)); }, []);
  if (!t) return null;
  const save = async () => {
    try { await api.put("/settings/kpi-thresholds", { achieved: Number(t.achieved), on_track: Number(t.on_track), at_risk: Number(t.at_risk) }); toast.success("Thresholds saved"); }
    catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Panel title="KPI Status Thresholds" testid="thresholds-tab">
      <p className="text-sm text-slate-500 mb-4">Achievement % at or above each value sets the KPI status. Below “At risk” is “Below target”.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl">
        {[["achieved", "Achieved ≥"], ["on_track", "On track ≥"], ["at_risk", "At risk ≥"]].map(([k, l]) => (
          <div key={k}><label className="fe-kpi-label">{l} (%)</label><input type="number" disabled={!can} className="fe-input mt-1" value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} data-testid={`threshold-${k}`} /></div>))}
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
  const tabs = [
    { id: "scorecard", label: "KPI Scorecard" },
    { id: "targets", label: "Sales Targets" },
    ...(canConfig ? [{ id: "assignments", label: "KPI Assignments" }] : []),
    { id: "library", label: "KPI Library" },
    { id: "settings", label: "Thresholds" },
  ];
  const tab = tabs.find((t) => t.id === params.get("tab"))?.id || "scorecard";
  useEffect(() => { api.get("/meta/employees").then((r) => setEmployees(r.data)).catch(() => {}); }, []);

  return (
    <div className="space-y-5" data-testid="targets-page">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold" style={{ color: "#262262" }}>Targets &amp; KPIs</h1>
        <p className="text-sm text-slate-500 mt-1">Configurable KPI library, management-approved targets, revision history and weighted scorecards. No figures are pre-filled.</p>
      </div>
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto" data-testid="targets-tabs">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setParams({ tab: t.id })} data-testid={`targets-tab-${t.id}`}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t.id ? "border-[#264494] text-[#264494]" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{t.label}</button>
        ))}
      </div>
      {tab === "scorecard" && <ScorecardTab employees={employees} />}
      {tab === "targets" && <SalesTargetsTab employees={employees} />}
      {tab === "assignments" && employees.length > 0 && <AssignmentsTab employees={employees} />}
      {tab === "library" && <LibraryTab />}
      {tab === "settings" && <ThresholdsTab />}
    </div>
  );
}
