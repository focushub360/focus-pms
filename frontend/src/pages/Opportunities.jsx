import { useEffect, useState, useMemo } from "react";
import { api, fmtINR, hasPerm } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import KanbanBoard from "@/components/KanbanBoard";

const STAGES = ["New", "Contacted", "Qualified", "Meeting / Discovery", "Solution Development", "Proposal Submitted", "Negotiation", "Won", "Lost", "On Hold"];

const DEFAULT = {
  title: "", account_name: "", decision_maker: "", stage: "New", po_reference: "", won_lost_reason: "",
  value_inr: 0, expected_close_date: "", primary_owner_id: "", contributors: [], notes: "",
};

export default function Opportunities() {
  const { user } = useAuth();
  const [opps, setOpps] = useState([]);
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(DEFAULT);
  const [view, setView] = useState("board");

  const load = async () => {
    const [o, u] = await Promise.all([api.get("/opportunities"), api.get("/users")]);
    setOpps(o.data); setUsers(u.data);
  };
  useEffect(() => { load(); }, []);

  const salesUsers = useMemo(() => users.filter((u) => u.is_sales_contributor && u.is_active), [users]);
  const totalPct = form.contributors.reduce((s, c) => s + Number(c.credit_pct || 0), 0);

  const openCreate = () => { setForm({ ...DEFAULT, primary_owner_id: user.id, contributors: [{ user_id: user.id, credit_pct: 100 }] }); setEditing(null); setShowForm(true); };
  const openEdit = (o) => {
    setEditing(o);
    setForm({
      ...DEFAULT, ...o,
      expected_close_date: (o.expected_close_date || "").slice(0, 10),
      contributors: o.contributors?.length ? o.contributors : [{ user_id: o.primary_owner_id, credit_pct: 100 }],
    });
    setShowForm(true);
  };

  const addContributor = () => setForm((f) => ({ ...f, contributors: [...f.contributors, { user_id: "", credit_pct: 0 }] }));
  const removeContributor = (i) => setForm((f) => ({ ...f, contributors: f.contributors.filter((_, idx) => idx !== i) }));
  const updateContributor = (i, patch) => setForm((f) => ({ ...f, contributors: f.contributors.map((c, idx) => idx === i ? { ...c, ...patch } : c) }));

  const normalize = () => {
    if (!form.contributors.length) return;
    const t = form.contributors.reduce((s, c) => s + Number(c.credit_pct || 0), 0);
    if (!t) return;
    setForm((f) => ({ ...f, contributors: f.contributors.map((c) => ({ ...c, credit_pct: Math.round((c.credit_pct / t) * 10000) / 100 })) }));
  };

  const save = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      value_inr: Number(form.value_inr || 0),
      expected_close_date: form.expected_close_date || null,
      contributors: form.contributors.filter((c) => c.user_id).map((c) => ({ user_id: c.user_id, credit_pct: Number(c.credit_pct || 0) })),
    };
    try {
      if (editing) await api.patch(`/opportunities/${editing.id}`, payload);
      else await api.post("/opportunities", payload);
      toast.success("Opportunity saved");
      setShowForm(false); setEditing(null);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    }
  };

  const canManage = hasPerm(user, "SALES_OPPORTUNITY_MANAGE");

  return (
    <div className="space-y-6" data-testid="opps-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold" style={{ color: "#262262" }}>Opportunities</h1>
          <p className="text-sm text-slate-500 mt-1">Primary owner + supporting contributors with credit split. Total share never exceeds order value.</p>
        </div>
        <div className="flex gap-2">
          <div className="flex border border-slate-200 rounded-md overflow-hidden text-sm" data-testid="opp-view-toggle">
            {["board", "list"].map((v) => <button key={v} onClick={() => setView(v)} data-testid={`opp-view-${v}`} className={`px-3 py-1.5 ${view === v ? "bg-[#264494] text-white" : "bg-white text-slate-600"}`}>{v === "board" ? "Board" : "List"}</button>)}
          </div>
          {canManage && <button className="fe-btn-primary" onClick={openCreate} data-testid="btn-new-opp">+ New opportunity</button>}
        </div>
      </div>

      {view === "board" && <KanbanBoard opps={opps} users={users} stages={STAGES} onMoved={load} onOpen={canManage ? openEdit : null} />}
      <div className={`bg-white border border-slate-200 rounded-lg overflow-x-auto ${view === "board" ? "hidden" : ""}`}>
        <table className="fe-table" data-testid="opps-table">
          <thead>
            <tr>
              <th>Title</th><th>Account</th><th>Stage</th><th>Primary Owner</th><th>Contributors</th>
              <th className="text-right">Value</th><th className="text-right">Close</th><th></th>
            </tr>
          </thead>
          <tbody>
            {opps.map((o) => {
              const owner = users.find((u) => u.id === o.primary_owner_id);
              return (
                <tr key={o.id} data-testid={`opp-row-${o.id}`}>
                  <td className="font-semibold text-slate-800">{o.title}</td>
                  <td>{o.account_name}</td>
                  <td><StageBadge s={o.stage} /></td>
                  <td>{owner?.name || "—"}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {(o.contributors || []).map((c) => {
                        const u = users.find((x) => x.id === c.user_id);
                        return <span key={c.user_id} className="fe-chip fe-chip-blue">{u?.name?.split(" ")[0] || "?"} · {c.credit_pct}%</span>;
                      })}
                    </div>
                  </td>
                  <td className="text-right font-semibold">{fmtINR(o.value_inr)}</td>
                  <td className="text-right text-xs">{o.expected_close_date?.slice(0, 10) || "—"}</td>
                  <td className="text-right">{canManage && <button className="text-xs text-[#264494] hover:underline" onClick={() => openEdit(o)} data-testid={`edit-opp-${o.id}`}>Edit</button>}</td>
                </tr>
              );
            })}
            {opps.length === 0 && <tr><td colSpan={8} className="text-center text-slate-400 py-6">No opportunities yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <form onSubmit={save} className="bg-white rounded-xl shadow-xl max-w-2xl w-full my-8 p-6 border border-slate-200" data-testid="opp-form">
            <h2 className="text-xl font-bold" style={{ color: "#262262" }}>{editing ? "Edit opportunity" : "New opportunity"}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="md:col-span-2"><label className="fe-kpi-label">Title</label><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="fe-input mt-1" data-testid="opp-title"/></div>
              <div><label className="fe-kpi-label">Account</label><input required value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} className="fe-input mt-1"/></div>
              <div><label className="fe-kpi-label">Decision Maker</label><input value={form.decision_maker} onChange={(e) => setForm({ ...form, decision_maker: e.target.value })} className="fe-input mt-1"/></div>
              <div><label className="fe-kpi-label">Stage</label>
                <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} className="fe-input mt-1">{STAGES.map((s) => <option key={s}>{s}</option>)}</select>
              </div>
              <div><label className="fe-kpi-label">Value (INR)</label><input type="number" min="0" step="1000" value={form.value_inr} onChange={(e) => setForm({ ...form, value_inr: e.target.value })} className="fe-input mt-1" data-testid="opp-value"/></div>
              <div><label className="fe-kpi-label">Expected Close</label><input type="date" value={form.expected_close_date || ""} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} className="fe-input mt-1"/></div>
              <div><label className="fe-kpi-label">Primary Owner</label>
                <select required value={form.primary_owner_id} onChange={(e) => setForm({ ...form, primary_owner_id: e.target.value })} className="fe-input mt-1" data-testid="opp-primary">
                  <option value="">— Select —</option>
                  {salesUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              <div><label className="fe-kpi-label">PO / Agreement Ref.{form.stage === "Won" && " *"}</label><input required={form.stage === "Won"} value={form.po_reference || ""} onChange={(e) => setForm({ ...form, po_reference: e.target.value })} className="fe-input mt-1" data-testid="opp-po"/></div>
              <div><label className="fe-kpi-label">Won / Lost / On-hold reason{["Lost", "On Hold"].includes(form.stage) && " *"}</label><input required={["Lost", "On Hold"].includes(form.stage)} value={form.won_lost_reason || ""} onChange={(e) => setForm({ ...form, won_lost_reason: e.target.value })} className="fe-input mt-1" data-testid="opp-reason"/></div>
              </div>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="fe-kpi-label">Credit split · supporting contributors</div>
                  <div className="text-xs text-slate-500">Total must equal 100%. {totalPct !== 100 && <span className="text-rose-600 font-semibold">(current: {totalPct}%)</span>}</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={normalize} className="fe-btn-secondary text-xs" data-testid="opp-normalize">Normalize to 100%</button>
                  <button type="button" onClick={addContributor} className="fe-btn-secondary text-xs" data-testid="opp-add-contributor">+ Add contributor</button>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {form.contributors.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select value={c.user_id} onChange={(e) => updateContributor(i, { user_id: e.target.value })} className="fe-input flex-1">
                      <option value="">— Contributor —</option>
                      {salesUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <input type="number" min="0" max="100" step="0.1" value={c.credit_pct} onChange={(e) => updateContributor(i, { credit_pct: Number(e.target.value) })} className="fe-input w-24" />
                    <span className="text-xs text-slate-500">%</span>
                    <button type="button" onClick={() => removeContributor(i)} className="text-rose-600 text-xs hover:underline">Remove</button>
                  </div>
                ))}
                {form.contributors.length === 0 && <div className="text-xs text-slate-400">No supporting contributors — primary owner gets 100%.</div>}
              </div>
            </div>

            <div className="mt-6"><label className="fe-kpi-label">Notes</label><textarea rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="fe-input mt-1"/></div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="fe-btn-secondary">Cancel</button>
              <button type="submit" className="fe-btn-primary" data-testid="opp-submit">{editing ? "Save changes" : "Create opportunity"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function StageBadge({ s }) {
  const map = { New: "fe-chip-blue", Contacted: "fe-chip-blue", Qualified: "fe-chip-cyan", "Meeting / Discovery": "fe-chip-cyan", "Solution Development": "fe-chip-purple", "Proposal Submitted": "fe-chip-purple", Negotiation: "fe-chip-orange", Won: "fe-chip-green", Lost: "fe-chip-red", "On Hold": "fe-chip-orange" };
  return <span className={`fe-chip ${map[s] || "fe-chip-blue"}`}>{s}</span>;
}
