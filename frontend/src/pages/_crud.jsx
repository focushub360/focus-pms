import { useEffect, useState } from "react";
import { api, hasPerm } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import ImportDialog from "@/components/ImportDialog";

export function makeCrudPage({ title, subtitle, endpoint, perm, fields, rowRender, headers, defaultForm, testid }) {
  return function Page() {
    const { user } = useAuth();
    const can = hasPerm(user, perm);
    const [rows, setRows] = useState([]);
    const [users, setUsers] = useState([]);
    const [show, setShow] = useState(false);
    const [importing, setImporting] = useState(false);
    const entity = ["/leads", "/accounts"].includes(endpoint) ? endpoint.slice(1) : null;
    const [form, setForm] = useState({ ...defaultForm });

    const load = async () => {
      try {
        const [r, u] = await Promise.all([api.get(endpoint), api.get("/users")]);
        setRows(r.data); setUsers(u.data);
      } catch {}
    };
    useEffect(() => { load(); }, []);

    const openCreate = () => { setForm({ ...defaultForm, owner_id: user.id }); setShow(true); };
    const save = async (e) => {
      e.preventDefault();
      try {
        await api.post(endpoint, form);
        toast.success("Saved");
        setShow(false); load();
      } catch (err) { toast.error(err?.response?.data?.detail || "Save failed"); }
    };

    return (
      <div className="space-y-6" data-testid={testid}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold" style={{ color: "#262262" }}>{title}</h1>
            <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
          </div>
          <div className="flex gap-2">
            {can && entity && <button className="fe-btn-secondary" onClick={() => setImporting(true)} data-testid={`${testid}-import`}>Bulk import</button>}
            {can && <button className="fe-btn-primary" onClick={openCreate} data-testid={`${testid}-new`}>+ New</button>}
          </div>
        </div>
        {importing && <ImportDialog entity={entity} onClose={() => setImporting(false)} onDone={load} />}
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="fe-table">
            <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => rowRender(r, users, load))}
              {rows.length === 0 && <tr><td colSpan={headers.length} className="text-center text-slate-400 py-6">No records yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {show && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
            <form onSubmit={save} className="bg-white rounded-xl shadow-xl max-w-2xl w-full my-8 p-6 border border-slate-200">
              <h2 className="text-xl font-bold" style={{ color: "#262262" }}>New {title.slice(0, -1)}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {fields.map((f) => (
                  <div key={f.key} className={f.full ? "md:col-span-2" : ""}>
                    <label className="fe-kpi-label">{f.label}</label>
                    {f.type === "select" ? (
                      <select value={form[f.key] || ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="fe-input mt-1">
                        {f.options.map((o) => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
                      </select>
                    ) : f.type === "users" ? (
                      <select value={form[f.key] || ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="fe-input mt-1">
                        <option value="">— Select —</option>
                        {users.filter((u) => u.is_sales_contributor && u.is_active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    ) : (
                      <input type={f.type || "text"} required={f.required} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value })} className="fe-input mt-1"/>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setShow(false)} className="fe-btn-secondary">Cancel</button>
                <button type="submit" className="fe-btn-primary">Save</button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  };
}
