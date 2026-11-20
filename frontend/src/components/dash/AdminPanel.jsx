import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errMsg } from "@/lib/api";
import { KpiCard, Panel, Empty, Loading } from "./ui";

export default function AdminPanel() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api.get("/dashboard/admin").then((r) => setD(r.data)).catch((e) => setErr(errMsg(e))); }, []);
  if (err) return <Panel><Empty text={err} /></Panel>;
  if (!d) return <Loading />;
  return (
    <div className="space-y-6" data-testid="admin-panel">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <KpiCard label="Users" value={d.users.total} sub={`${d.users.active} active`} testid="admin-users" />
        <KpiCard label="Inactive" value={d.users.inactive} accent="#F19A2F" />
        <KpiCard label="Test accounts" value={d.users.test} accent="#903B96" sub="Excluded from reporting" />
        <KpiCard label="Duplicates" value={d.users.duplicates} accent="#E81B90" sub="Excluded from reporting" />
        <KpiCard label="Audit (7 days)" value={d.audit.last_7_days} sub={`${d.audit.total} total`} accent="#51C5DC" />
        <KpiCard label="Database" value={d.health.database} accent={d.health.database === "OK" ? "#10B981" : "#EF4444"} testid="admin-health" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Data Completeness" testid="admin-completeness">
          <table className="fe-table"><tbody>{d.data_completeness.map((c) => (
            <tr key={c.check}><td>{c.check}</td><td className="text-right">{c.count ? <span className="fe-chip fe-chip-orange">{c.count}{c.of ? ` / ${c.of}` : ""}</span> : <span className="fe-chip fe-chip-green">0</span>}</td></tr>))}</tbody></table>
        </Panel>
        <Panel title="Configuration" testid="admin-config">
          <table className="fe-table"><tbody>
            <tr><td>Roles</td><td className="text-right">{d.config.roles}</td></tr>
            <tr><td>KPI definitions</td><td className="text-right">{d.config.kpi_definitions}</td></tr>
            <tr><td>KPI assignments</td><td className="text-right">{d.config.kpi_assignments}</td></tr>
            <tr><td>Department target set</td><td className="text-right">{d.config.department_target_set ? "Yes" : "No"}</td></tr>
          </tbody></table>
          <div className="flex gap-3 mt-4 text-xs"><Link className="text-[#264494] hover:underline" to="/app/users">Users & permissions →</Link><Link className="text-[#264494] hover:underline" to="/app/targets?tab=library">KPI Library →</Link><Link className="text-[#264494] hover:underline" to="/app/audit">Audit log →</Link></div>
        </Panel>
      </div>
      <Panel title="User Activity" testid="admin-activity">
        <div className="overflow-x-auto"><table className="fe-table"><thead><tr><th>User</th><th>Email</th><th>Last login</th><th>Status</th></tr></thead>
          <tbody>{d.user_activity.map((u) => <tr key={u.id}><td className="font-medium">{u.name}</td><td className="text-xs">{u.email}</td><td className="text-xs">{u.last_login_at ? new Date(u.last_login_at).toLocaleString("en-IN") : "Never"}</td>
            <td>{u.is_test ? <span className="fe-chip fe-chip-purple">Test</span> : u.is_duplicate ? <span className="fe-chip fe-chip-orange">Duplicate</span> : u.is_active ? <span className="fe-chip fe-chip-green">Active</span> : <span className="fe-chip fe-chip-red">Inactive</span>}</td></tr>)}</tbody></table></div>
      </Panel>
    </div>
  );
}
