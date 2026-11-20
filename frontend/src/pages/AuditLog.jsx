import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => { (async () => { try { const r = await api.get("/audit-logs"); setLogs(r.data); } catch {} })(); }, []);
  const filtered = q
    ? logs.filter((l) => JSON.stringify(l).toLowerCase().includes(q.toLowerCase()))
    : logs;

  return (
    <div className="space-y-6" data-testid="audit-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold" style={{ color: "#262262" }}>Audit Log</h1>
          <p className="text-sm text-slate-500 mt-1">Complete trail of important user actions, access and permission changes.</p>
        </div>
        <input placeholder="Search action, user, entity…" value={q} onChange={(e) => setQ(e.target.value)} className="fe-input max-w-xs" data-testid="audit-search"/>
      </div>
      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="fe-table">
          <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id}>
                <td className="text-xs text-slate-500">{new Date(l.at).toLocaleString("en-IN")}</td>
                <td>{l.user_name || "—"} <div className="text-xs text-slate-400">{l.user_email}</div></td>
                <td><span className="fe-chip fe-chip-purple">{l.action}</span></td>
                <td>{l.entity}</td>
                <td className="text-xs text-slate-500 max-w-md truncate">{JSON.stringify(l.details || {})}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-6">No audit entries.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
