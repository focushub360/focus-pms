import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errMsg, fmtINR, hasAnyPerm } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { KpiCard, Panel, Empty, Loading, Progress } from "@/components/dash/ui";
import ProjectDialog from "@/components/projects/ProjectDialog";
import { toast } from "sonner";
import { Plus, FolderKanban, ArrowRight } from "lucide-react";

const STAGES = ["All", "Design", "Execution", "Commissioning", "Completed", "On Hold"];
const NEXT_STAGE = { Design: "Execution", Execution: "Commissioning", Commissioning: "Completed" };
const STAGE_CHIP = {
  Design: "fe-chip-blue",
  Execution: "fe-chip-purple",
  Commissioning: "fe-chip-orange",
  Completed: "fe-chip-green",
  "On Hold": "fe-chip-red",
};

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState(null);
  const [users, setUsers] = useState([]);
  const [opps, setOpps] = useState([]);
  const [stage, setStage] = useState("All");
  const [editing, setEditing] = useState(null);
  const [showDlg, setShowDlg] = useState(false);

  const canWrite = hasAnyPerm(user, ["MANAGEMENT_BOARD_VIEW", "HOD_VIEW", "SYSTEM_ADMIN", "SALES_OPPORTUNITY_MANAGE", "TARGETS_CONFIGURE"]);

  const load = useCallback(async () => {
    try {
      const [p, u, o] = await Promise.all([
        api.get("/projects"),
        api.get("/users").catch(() => ({ data: [] })),
        api.get("/opportunities").catch(() => ({ data: [] })),
      ]);
      setProjects(p.data);
      setUsers(u.data);
      setOpps(o.data);
    } catch (e) {
      toast.error(errMsg(e));
      setProjects([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name])), [users]);
  const filtered = useMemo(
    () => (projects || []).filter((p) => stage === "All" || p.stage === stage),
    [projects, stage]
  );

  const totals = useMemo(() => {
    const list = projects || [];
    const active = list.filter((p) => ["Design", "Execution", "Commissioning"].includes(p.stage));
    return {
      total: list.length,
      active: active.length,
      design: list.filter((p) => p.stage === "Design").length,
      execution: list.filter((p) => p.stage === "Execution").length,
      commissioning: list.filter((p) => p.stage === "Commissioning").length,
      contract: list.reduce((s, p) => s + Number(p.contract_value_inr || 0), 0),
      invoiced: list.reduce((s, p) => s + Number(p.invoiced_inr || 0), 0),
      collected: list.reduce((s, p) => s + Number(p.collected_inr || 0), 0),
    };
  }, [projects]);

  const advance = async (p) => {
    const nxt = NEXT_STAGE[p.stage];
    if (!nxt) return;
    try {
      await api.patch(`/projects/${p.id}`, { stage: nxt, progress_pct: nxt === "Completed" ? 100 : Math.max(p.progress_pct || 0, nxt === "Execution" ? 45 : 80) });
      toast.success(`Moved "${p.name}" to ${nxt}`);
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="space-y-6" data-testid="projects-page">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-[#262262] flex items-center gap-2">
            <FolderKanban size={24} className="text-[#264494]" /> Projects in Hand
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Monitor active engineering projects across Design, Execution, Commissioning &amp; commercial collections.
          </p>
        </div>
        {canWrite && (
          <button
            className="fe-btn-primary text-xs sm:text-sm shrink-0"
            onClick={() => { setEditing(null); setShowDlg(true); }}
            data-testid="btn-new-project"
          >
            <Plus size={16} /> New Project
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="Active Projects" value={totals.active} sub={`${totals.total} total`} accent="#264494" />
        <KpiCard label="Design" value={totals.design} accent="#007AFF" />
        <KpiCard label="Execution" value={totals.execution} accent="#5856D6" />
        <KpiCard label="Commissioning" value={totals.commissioning} accent="#F19A2F" />
        <KpiCard label="Contract Value" value={fmtINR(totals.contract)} accent="#262262" />
        <KpiCard label="Collected" value={fmtINR(totals.collected)} sub={`Invoiced ${fmtINR(totals.invoiced)}`} accent="#10B981" />
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
        {STAGES.map((st) => (
          <button
            key={st}
            onClick={() => setStage(st)}
            data-testid={`proj-tab-${st}`}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              stage === st ? "bg-[#264494] text-white shadow-xs" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      <Panel title={`Projects (${filtered.length})`}>
        {!projects ? <Loading /> : filtered.length ? (
          <div className="overflow-x-auto">
            <table className="fe-table" data-testid="projects-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Project &amp; Client</th>
                  <th>Stage</th>
                  <th>Progress</th>
                  <th className="text-right">Contract</th>
                  <th className="text-right">Invoiced</th>
                  <th className="text-right">Collected</th>
                  <th>PM</th>
                  <th>Target Date</th>
                  {canWrite && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} data-testid={`project-row-${p.id}`}>
                    <td className="text-xs font-mono text-slate-500">{p.project_code}</td>
                    <td>
                      <div className="font-semibold text-slate-800">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.client_name}</div>
                    </td>
                    <td><span className={`fe-chip ${STAGE_CHIP[p.stage] || "fe-chip-blue"}`}>{p.stage}</span></td>
                    <td className="min-w-[130px]">
                      <div className="text-xs font-semibold mb-1">{p.progress_pct ?? 0}%</div>
                      <Progress pct={p.progress_pct ?? 0} height={6} color={p.stage === "Completed" ? "#10B981" : "#264494"} />
                    </td>
                    <td className="text-right font-semibold">{fmtINR(p.contract_value_inr)}</td>
                    <td className="text-right">{fmtINR(p.invoiced_inr)}</td>
                    <td className="text-right text-emerald-700 font-semibold">{fmtINR(p.collected_inr)}</td>
                    <td className="text-xs">{userMap[p.project_manager_id] || "—"}</td>
                    <td className="text-xs text-slate-500">{p.expected_end_date?.slice(0, 10) || "—"}</td>
                    {canWrite && (
                      <td className="text-right whitespace-nowrap space-x-2">
                        {NEXT_STAGE[p.stage] && (
                          <button
                            onClick={() => advance(p)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                            data-testid={`advance-proj-${p.id}`}
                          >
                            {NEXT_STAGE[p.stage]} <ArrowRight size={12} />
                          </button>
                        )}
                        <button
                          onClick={() => { setEditing(p); setShowDlg(true); }}
                          className="text-xs font-semibold text-[#264494] hover:underline"
                          data-testid={`edit-proj-${p.id}`}
                        >
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty text="No projects in this stage yet." hint="Click + New Project to track Design, Execution, and Commissioning work." />}
      </Panel>

      {showDlg && (
        <ProjectDialog
          project={editing}
          users={users}
          opportunities={opps}
          onClose={() => { setShowDlg(false); setEditing(null); }}
          onSaved={() => { setShowDlg(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
