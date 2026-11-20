import { useEffect, useState } from "react";
import { api, errMsg, fmtVal, FY } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Panel, Empty, Loading, Select } from "@/components/dash/ui";
import { catLabel } from "@/components/dash/Scorecard";
import ReasonDialog from "@/components/dash/ReasonDialog";
import CoreWeights from "@/components/targets/CoreWeights";
import { toast } from "sonner";

const FREQS = ["DAILY", "WEEKLY", "FORTNIGHTLY", "MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUAL"];
const SECTIONS = {
  all: { label: "All KPIs", match: () => true },
  core: { label: "Core KPIs (7)", match: (c, a) => a.is_core },
  optional: { label: "Optional KPIs", match: (c, a) => !a.is_core },
  sales: { label: "Sales performance", match: (c) => ["SALES_PERFORMANCE", "REVENUE_COMMERCIAL", "PROPOSAL_CONVERSION"].includes(c) },
  activity: { label: "Activity targets", match: (c) => ["CUSTOMER_ENGAGEMENT", "LEAD_PROSPECT"].includes(c) },
  functional: { label: "Functional KPIs", match: (c) => c?.startsWith("FUNC_") },
  campaign: { label: "Campaign targets", match: (c) => c === "FUNC_MARKETING" },
};

function Row({ a, onSaved, onAskReason }) {
  const [f, setF] = useState({ target_value: a.target_value ?? "", weightage: a.weightage ?? "", frequency: a.frequency, is_active: a.is_active, is_core: !!a.is_core });
  const dirty = String(f.target_value) !== String(a.target_value ?? "") || String(f.weightage) !== String(a.weightage ?? "") || f.frequency !== a.frequency || f.is_active !== a.is_active || f.is_core !== !!a.is_core;
  const save = () => onAskReason(async (reason) => {
    try {
      await api.patch(`/kpi/assignments/${a.id}`, {
        target_value: f.target_value === "" ? null : Number(f.target_value), weightage: f.weightage === "" ? null : Number(f.weightage),
        frequency: f.frequency, is_active: f.is_active, is_core: f.is_core, reason });
      toast.success("KPI assignment updated"); onSaved();
    } catch (e) { toast.error(errMsg(e)); }
  });
  return (
    <tr className={a.is_active ? "" : "opacity-50"} data-testid={`assign-row-${a.kpi_code}`}>
      <td><div className="font-medium text-slate-800">{a.kpi_name}</div><div className="text-[11px] text-slate-400">{catLabel(a.category)} · {a.data_source === "SYSTEM" ? "Auto-calculated" : "Manual entry"}</div></td>
      <td><input type="number" min="0" step="any" className="fe-input py-1 w-28 text-right" value={f.target_value} onChange={(e) => setF({ ...f, target_value: e.target.value })} placeholder="Not set" data-testid={`assign-target-${a.kpi_code}`} /><div className="text-[10px] text-slate-400">{a.unit}</div></td>
      <td><input type="number" min="0" max="100" className="fe-input py-1 w-20 text-right" value={f.weightage} onChange={(e) => setF({ ...f, weightage: e.target.value })} data-testid={`assign-weight-${a.kpi_code}`} /></td>
      <td><select className="fe-input py-1 text-xs w-auto" value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}>{FREQS.map((x) => <option key={x}>{x}</option>)}</select></td>
      <td className="text-right">{fmtVal(a.actual_value, a.unit)}</td>
      <td><input type="checkbox" checked={f.is_core} onChange={(e) => setF({ ...f, is_core: e.target.checked })} data-testid={`assign-core-${a.kpi_code}`} /></td>
      <td><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /></td>
      <td><span className={`fe-chip ${a.approval_status === "APPROVED" ? "fe-chip-green" : "fe-chip-blue"}`}>{a.approval_status}</span></td>
      <td><button className="fe-btn-primary text-xs py-1 disabled:opacity-40" disabled={!dirty} onClick={save} data-testid={`assign-save-${a.kpi_code}`}>Save</button></td>
    </tr>
  );
}

function AddDialog({ uid, existing, onClose, onSaved }) {
  const [defs, setDefs] = useState([]);
  const [code, setCode] = useState("");
  const [target, setTarget] = useState("");
  const [weight, setWeight] = useState("");
  useEffect(() => { api.get("/kpi/definitions").then((r) => setDefs(r.data.filter((d) => d.is_active && !existing.includes(d.code)))); }, [existing]);
  const save = async (e) => {
    e.preventDefault();
    if (!code) return toast.error("Select a KPI");
    try { await api.post("/kpi/assignments", { user_id: uid, kpi_code: code, fy_code: FY, target_value: target === "" ? null : Number(target), weightage: weight === "" ? null : Number(weight) }); toast.success("KPI assigned"); onSaved(); }
    catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
      <form onSubmit={save} className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 border border-slate-200" data-testid="add-assignment-dialog">
        <h3 className="text-lg font-bold text-[#262262]">Assign KPI</h3>
        <label className="fe-kpi-label block mt-4">KPI</label>
        <select className="fe-input mt-1" value={code} onChange={(e) => setCode(e.target.value)} data-testid="add-assignment-kpi"><option value="">— Select —</option>
          {defs.map((d) => <option key={d.code} value={d.code}>{catLabel(d.category)} · {d.name}</option>)}</select>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div><label className="fe-kpi-label">Target (optional)</label><input type="number" min="0" className="fe-input mt-1" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
          <div><label className="fe-kpi-label">Weightage %</label><input type="number" min="0" max="100" className="fe-input mt-1" value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
        </div>
        <div className="mt-5 flex justify-end gap-2"><button type="button" className="fe-btn-secondary" onClick={onClose}>Cancel</button><button className="fe-btn-primary" data-testid="add-assignment-save">Assign</button></div>
      </form>
    </div>
  );
}

export default function AssignmentsTab({ employees: all }) {
  const { user } = useAuth();
  const employees = all.filter((e) => e.id !== user.id);
  const [uid, setUid] = useState(employees[0]?.id || "");
  const [section, setSection] = useState("all");
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const [ask, setAsk] = useState(null);
  const [tick, setTick] = useState(0);
  const load = () => setTick((t) => t + 1);
  useEffect(() => {
    if (!uid) return undefined;
    let live = true;
    setRows(null);
    api.get("/kpi/assignments", { params: { user_id: uid, fy_code: FY } })
      .then((r) => live && setRows(r.data))
      .catch((e) => { if (live) { toast.error(errMsg(e)); setRows([]); } });
    return () => { live = false; };
  }, [uid, tick]);
  const shown = (rows || []).filter((a) => a.user_id === uid && SECTIONS[section].match(a.category, a)).sort((x, y) => !!y.is_core - !!x.is_core);
  const wsum = shown.filter((a) => a.is_active).reduce((s, a) => s + Number(a.weightage || 0), 0);
  return (
    <div className="space-y-4" data-testid="assignments-tab">
      <div className="flex flex-wrap items-center gap-2">
        <span className="fe-kpi-label">Employee</span>
        <Select value={uid} onChange={setUid} testid="assign-employee" options={employees.map((e) => ({ value: e.id, label: e.name }))} />
        <Select value={section} onChange={setSection} testid="assign-section" options={Object.entries(SECTIONS).map(([k, v]) => ({ value: k, label: v.label }))} />
        <span className="text-xs text-slate-500 ml-2">Active weightage in view: <b className={wsum > 100 ? "text-rose-600" : ""}>{wsum}</b></span>
        <button className="fe-btn-primary text-xs ml-auto" onClick={() => setAdding(true)} data-testid="add-assignment">+ Assign KPI</button>
      </div>
      {rows && <CoreWeights uid={uid} rows={rows.filter((a) => a.user_id === uid)} onSaved={load} />}
      <Panel>
        {!rows ? <Loading /> : shown.length ? (
          <div className="overflow-x-auto"><table className="fe-table"><thead><tr><th>KPI</th><th>Target</th><th>Weight %</th><th>Frequency</th><th className="text-right">Latest actual</th><th>Core</th><th>Active</th><th>Approval</th><th></th></tr></thead>
            <tbody>{shown.map((a) => <Row key={`${uid}-${a.id}`} a={a} onSaved={load} onAskReason={(fn) => setAsk(() => fn)} />)}</tbody></table></div>
        ) : <Empty text="No KPIs in this section." />}
      </Panel>
      {ask && <ReasonDialog title="Reason for KPI target change" confirmText="Save change" onCancel={() => setAsk(null)} onConfirm={(r) => { const fn = ask; setAsk(null); fn(r); }} />}
      {adding && <AddDialog uid={uid} existing={(rows || []).map((r) => r.kpi_code)} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}
