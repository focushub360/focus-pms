import { useEffect, useState } from "react";
import { api, errMsg, hasPerm } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Panel, Empty, Loading, Select } from "@/components/dash/ui";
import { catLabel } from "@/components/dash/Scorecard";
import { toast } from "sonner";

const FREQS = ["DAILY", "WEEKLY", "FORTNIGHTLY", "MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUAL"];
const BLANK = { code: "", name: "", category: "SALES_PERFORMANCE", description: "", unit: "count", formula: "", frequency: "MONTHLY", applicable_roles: [], applies_to_all_sales: false, direction: "higher", data_source: "MANUAL", is_active: true };

function KpiDialog({ kpi, cats, roles, onClose, onSaved }) {
  const [f, setF] = useState(kpi || BLANK);
  const set = (k, v) => setF({ ...f, [k]: v });
  const save = async (e) => {
    e.preventDefault();
    try {
      if (kpi) await api.patch(`/kpi/definitions/${kpi.id}`, f); else await api.post("/kpi/definitions", f);
      toast.success("KPI saved"); onSaved();
    } catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <form onSubmit={save} className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8 p-6 border border-slate-200" data-testid="kpi-dialog">
        <h3 className="text-lg font-bold text-[#262262]">{kpi ? "Edit KPI" : "New KPI"}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <div><label className="fe-kpi-label">Code</label><input required disabled={!!kpi} className="fe-input mt-1" value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} data-testid="kpi-code" /></div>
          <div><label className="fe-kpi-label">Name</label><input required className="fe-input mt-1" value={f.name} onChange={(e) => set("name", e.target.value)} data-testid="kpi-name" /></div>
          <div><label className="fe-kpi-label">Category</label><select className="fe-input mt-1" value={f.category} onChange={(e) => set("category", e.target.value)}>{cats.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div>
          <div><label className="fe-kpi-label">Unit</label><select className="fe-input mt-1" value={f.unit} onChange={(e) => set("unit", e.target.value)}>{["count", "INR", "%", "days", "hours", "/week"].map((u) => <option key={u}>{u}</option>)}</select></div>
          <div><label className="fe-kpi-label">Frequency</label><select className="fe-input mt-1" value={f.frequency} onChange={(e) => set("frequency", e.target.value)}>{FREQS.map((x) => <option key={x}>{x}</option>)}</select></div>
          <div><label className="fe-kpi-label">Direction</label><select className="fe-input mt-1" value={f.direction} onChange={(e) => set("direction", e.target.value)}><option value="higher">Higher is better</option><option value="lower">Lower is better</option></select></div>
          <div className="md:col-span-2"><label className="fe-kpi-label">Formula / measurement</label><input className="fe-input mt-1" value={f.formula} onChange={(e) => set("formula", e.target.value)} data-testid="kpi-formula" /></div>
          <div className="md:col-span-2"><label className="fe-kpi-label">Description</label><textarea rows={2} className="fe-input mt-1" value={f.description} onChange={(e) => set("description", e.target.value)} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm mt-3"><input type="checkbox" checked={f.applies_to_all_sales} onChange={(e) => set("applies_to_all_sales", e.target.checked)} /> Applicable to all sales contributors</label>
        <div className="fe-kpi-label mt-3 mb-1">Applicable roles</div>
        <div className="flex flex-wrap gap-2">{roles.map((r) => (
          <label key={r.code} className="text-xs flex items-center gap-1 border border-slate-200 rounded px-2 py-1"><input type="checkbox" checked={f.applicable_roles.includes(r.code)}
            onChange={() => set("applicable_roles", f.applicable_roles.includes(r.code) ? f.applicable_roles.filter((x) => x !== r.code) : [...f.applicable_roles, r.code])} />{r.name}</label>))}</div>
        <label className="flex items-center gap-2 text-sm mt-3"><input type="checkbox" checked={f.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Active</label>
        {f.data_source === "SYSTEM" && <div className="text-xs text-slate-500 mt-2">This KPI is auto-calculated from system records.</div>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" className="fe-btn-secondary" onClick={onClose}>Cancel</button><button className="fe-btn-primary" data-testid="kpi-save">Save KPI</button></div>
      </form>
    </div>
  );
}

export default function LibraryTab() {
  const { user } = useAuth();
  const can = hasPerm(user, "TARGETS_CONFIGURE");
  const [defs, setDefs] = useState(null);
  const [cats, setCats] = useState([]);
  const [roles, setRoles] = useState([]);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(undefined);
  const load = async () => {
    const [d, c, r] = await Promise.all([api.get("/kpi/definitions"), api.get("/kpi/categories"), api.get("/roles")]);
    setDefs(d.data); setCats(c.data); setRoles(r.data);
  };
  useEffect(() => { load().catch((e) => toast.error(errMsg(e))); }, []);
  if (!defs) return <Loading />;
  const shown = defs.filter((d) => (!cat || d.category === cat) && (!q || d.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="space-y-4" data-testid="library-tab">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={cat} onChange={setCat} testid="library-category" options={[{ value: "", label: `All categories (${defs.length})` }, ...cats.map((c) => ({ value: c.code, label: c.label }))]} />
        <input className="fe-input w-64 py-1.5" placeholder="Search KPI…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="library-search" />
        {can && <button className="fe-btn-primary text-xs ml-auto" onClick={() => setEdit(null)} data-testid="new-kpi">+ New KPI</button>}
      </div>
      <Panel>
        {shown.length ? <div className="overflow-x-auto"><table className="fe-table" data-testid="library-table"><thead><tr><th>KPI</th><th>Category</th><th>Unit</th><th>Formula</th><th>Frequency</th><th>Applies to</th><th>Source</th><th>Status</th>{can && <th></th>}</tr></thead>
          <tbody>{shown.map((d) => (
            <tr key={d.id} data-testid={`lib-row-${d.code}`}><td><div className="font-medium text-slate-800">{d.name}</div><div className="text-[11px] text-slate-400">{d.code}{d.is_custom ? " · custom" : ""}</div></td>
              <td className="text-xs">{catLabel(d.category)}</td><td className="text-xs">{d.unit}</td><td className="text-xs max-w-xs">{d.formula}</td><td className="text-xs">{d.frequency}</td>
              <td className="text-xs">{d.applies_to_all_sales ? "All sales contributors" : (d.applicable_roles || []).join(", ")}</td>
              <td><span className={`fe-chip ${d.data_source === "SYSTEM" ? "fe-chip-cyan" : "fe-chip-purple"}`}>{d.data_source === "SYSTEM" ? "Auto" : "Manual"}</span></td>
              <td>{d.is_active ? <span className="fe-chip fe-chip-green">Active</span> : <span className="fe-chip fe-chip-red">Inactive</span>}</td>
              {can && <td><button className="text-xs text-[#264494] hover:underline" onClick={() => setEdit(d)} data-testid={`edit-kpi-${d.code}`}>Edit</button></td>}</tr>))}</tbody></table></div>
          : <Empty text="No KPIs match." />}
      </Panel>
      {edit !== undefined && <KpiDialog kpi={edit} cats={cats} roles={roles} onClose={() => setEdit(undefined)} onSaved={() => { setEdit(undefined); load(); }} />}
    </div>
  );
}
