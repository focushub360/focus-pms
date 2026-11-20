import { useEffect, useState } from "react";
import { api, errMsg, FY } from "@/lib/api";
import { Panel } from "@/components/dash/ui";
import ReasonDialog from "@/components/dash/ReasonDialog";
import { toast } from "sonner";

export default function CoreWeights({ uid, rows, onSaved }) {
  const core = rows.filter((a) => a.is_core && a.is_active);
  const [w, setW] = useState({});
  const [ask, setAsk] = useState(false);
  useEffect(() => { setW(Object.fromEntries(core.map((a) => [a.id, a.weightage ?? ""]))); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = Object.values(w).reduce((s, x) => s + Number(x || 0), 0);
  const ok = core.length === 7 && Math.abs(total - 100) < 0.01;
  const save = async (reason) => {
    try {
      await api.put(`/kpi/core-weights/${uid}`, { fy_code: FY, reason, weights: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Number(v || 0)])) });
      toast.success("Core KPI weightage saved"); onSaved();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Panel title={`Core KPIs (${core.length}/7) — weightage must total 100%`} testid="core-weights">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {core.map((a) => (
          <label key={a.id} className="text-sm"><span className="block text-slate-700 truncate">{a.kpi_name}</span>
            <input type="number" min="0" max="100" className="fe-input py-1 mt-1" value={w[a.id] ?? ""} onChange={(e) => setW({ ...w, [a.id]: e.target.value })} data-testid={`core-weight-${a.kpi_code}`} /></label>))}
      </div>
      <div className="flex items-center gap-3 mt-4 text-sm">
        <span data-testid="core-weight-total">Total: <b className={ok ? "text-emerald-600" : "text-rose-600"}>{total}%</b></span>
        {core.length !== 7 && <span className="text-rose-600 text-xs">Exactly 7 core KPIs are required (tick “Core” in the table below).</span>}
        <button className="fe-btn-primary text-xs ml-auto disabled:opacity-40" disabled={!ok} onClick={() => setAsk(true)} data-testid="core-weight-save">Save core weightage</button>
      </div>
      {ask && <ReasonDialog title="Reason for weightage change" confirmText="Save" onCancel={() => setAsk(false)} onConfirm={(r) => { setAsk(false); save(r); }} />}
    </Panel>
  );
}
