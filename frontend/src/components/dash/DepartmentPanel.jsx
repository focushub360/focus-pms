import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errMsg, fmtINR, monthLabel } from "@/lib/api";
import { KpiCard, Panel, Empty, Loading, Select, Progress } from "./ui";
import { PipelineFunnel } from "./Charts";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line } from "recharts";

const axisINR = (v) => (v >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v);

function DepartmentSummary({ d }) {
  return (
    <div className="space-y-6" data-testid="department-summary">
      <div className="text-xs text-slate-500 bg-[#DCF3F8] rounded-md px-3 py-2">Department-level summary · {d.team_size} sales contributors. Individual employee figures are visible only to HOD and management.</div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <KpiCard label="Department Target" value={fmtINR(d.department_target_inr)} testid="sum-target" />
        <KpiCard label="Confirmed Sales" value={fmtINR(d.confirmed_won_inr)} sub={`${d.won_count} order(s)`} accent="#10B981" testid="sum-confirmed" />
        <KpiCard label="Achievement" value={d.achievement_pct === null ? "—" : `${d.achievement_pct}%`} accent="#F19A2F" testid="sum-achievement" />
        <KpiCard label="Active Pipeline" value={fmtINR(d.pipeline_inr)} accent="#51C5DC" />
        <KpiCard label="Qualified Leads" value={d.leads_qualified} sub={`of ${d.leads_total}`} accent="#903B96" />
        <KpiCard label="Win Rate" value={d.win_rate_pct === null ? "—" : `${d.win_rate_pct}%`} accent="#E81B90" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Department Monthly Confirmed Sales">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={d.monthly_trend.map((t) => ({ ...t, label: monthLabel(t.month) }))}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tickFormatter={axisINR} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => fmtINR(v)} contentStyle={{ fontSize: 12 }} /><Line dataKey="won_inr" name="Confirmed" stroke="#262262" strokeWidth={2.5} /></LineChart>
          </ResponsiveContainer>
        </Panel>
        <PipelineFunnel funnel={d.funnel} title="Department Pipeline Summary" />
      </div>
    </div>
  );
}

export default function DepartmentPanel({ filters, onOpenEmployee }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [emp, setEmp] = useState("");
  const [stage, setStage] = useState("");
  const [cat, setCat] = useState("");

  useEffect(() => {
    setD(null); setErr("");
    const params = { fy_code: filters.fy, ...(filters.month && { month: filters.month }), ...(filters.quarter && { quarter: filters.quarter }),
      ...(emp && { employee_id: emp }), ...(stage && { stage }), ...(cat && { category: cat }) };
    api.get("/dashboard/department", { params }).then((r) => setD(r.data)).catch((e) => setErr(errMsg(e)));
  }, [filters.fy, filters.month, filters.quarter, emp, stage, cat]);

  if (err) return <Panel><Empty text={err} /></Panel>;
  if (!d) return <Loading text="Loading department performance…" />;
  if (!d.detail) return <DepartmentSummary d={d} />;
  const contrib = d.rows.map((r) => ({ name: r.name.split(" ")[0], target: r.target_inr || 0, won: r.confirmed_won_inr, pipeline: r.pipeline_inr }));

  return (
    <div className="space-y-6" data-testid="department-panel">
      <div className="flex flex-wrap gap-2 items-center bg-white border border-slate-200 rounded-lg p-3" data-testid="dept-filters">
        <span className="fe-kpi-label mr-1">Filter</span>
        <Select value={emp} onChange={setEmp} testid="dept-filter-employee" options={[{ value: "", label: "All employees" }, ...(d.employees || []).map((e) => ({ value: e.id, label: e.name }))]} />
        <Select value={stage} onChange={setStage} testid="dept-filter-stage" options={[{ value: "", label: "All stages" }, ...d.stages.map((s) => ({ value: s, label: s }))]} />
        <Select value={cat} onChange={setCat} testid="dept-filter-category" options={[{ value: "", label: "All service categories" }, ...d.categories.map((c) => ({ value: c, label: c }))]} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3" data-testid="dept-kpis">
        <KpiCard label="Department Target" value={fmtINR(d.department_target_inr)} sub={d.department_target_source === "DEPARTMENT" ? "Approved dept target" : d.department_target_source ? "Sum of individual targets" : "Not set"} testid="dept-target" />
        <KpiCard label="Confirmed Sales" value={fmtINR(d.confirmed_won_inr)} sub={`${d.won_count} order(s)`} accent="#10B981" testid="dept-confirmed" />
        <KpiCard label="Achievement" value={d.achievement_pct === null ? "—" : `${d.achievement_pct}%`} accent="#F19A2F" testid="dept-achievement" />
        <KpiCard label="Active Pipeline" value={fmtINR(d.pipeline_inr)} sub={`weighted ${fmtINR(d.weighted_pipeline_inr)}`} accent="#51C5DC" testid="dept-pipeline" />
        <KpiCard label="Qualified Leads" value={d.leads_qualified} sub={`of ${d.leads_total}`} accent="#903B96" testid="dept-qualified" />
        <KpiCard label="Proposals" value={d.proposals_submitted} accent="#262262" testid="dept-proposals" />
        <KpiCard label="Win Rate" value={d.win_rate_pct === null ? "—" : `${d.win_rate_pct}%`} sub={`${d.lost_count} lost`} accent="#E81B90" testid="dept-winrate" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Sales Contribution by Employee" testid="dept-contribution">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={contrib}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tickFormatter={axisINR} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => fmtINR(v)} contentStyle={{ fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="target" name="Target" fill="#CBD6F2" /><Bar dataKey="won" name="Confirmed" fill="#264494" /><Bar dataKey="pipeline" name="Pipeline" fill="#51C5DC" /></BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Department Monthly Confirmed Sales" testid="dept-trend">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={d.monthly_trend.map((t) => ({ ...t, label: monthLabel(t.month) }))}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tickFormatter={axisINR} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => fmtINR(v)} contentStyle={{ fontSize: 12 }} /><Line dataKey="won_inr" name="Confirmed" stroke="#262262" strokeWidth={2.5} /></LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="Individual Performance Comparison" testid="dept-individual">
        <div className="overflow-x-auto"><table className="fe-table" data-testid="dept-individual-table">
          <thead><tr><th>Employee</th><th>Functional responsibility</th><th className="text-right">Target</th><th className="text-right">Confirmed</th><th>Achievement</th><th className="text-right">Pipeline</th><th className="text-right">Q. Leads</th><th className="text-right">Meetings</th><th className="text-right">Overdue</th><th></th></tr></thead>
          <tbody>{d.rows.map((r) => (
            <tr key={r.user_id} data-testid={`dept-row-${r.user_id}`}>
              <td className="font-semibold text-slate-800">{r.name}{!r.is_active && <span className="ml-1 fe-chip fe-chip-red">Inactive</span>}</td>
              <td className="text-xs">{r.functional_responsibility}</td>
              <td className="text-right">{fmtINR(r.target_inr)}</td>
              <td className="text-right font-semibold text-emerald-700">{fmtINR(r.confirmed_won_inr)}</td>
              <td className="min-w-[120px]"><div className="text-xs mb-1">{r.achievement_pct === null ? "No target" : `${r.achievement_pct}%`}</div><Progress pct={r.achievement_pct} height={6} /></td>
              <td className="text-right">{fmtINR(r.pipeline_inr)}</td><td className="text-right">{r.leads_qualified}</td><td className="text-right">{r.meetings_completed}</td>
              <td className="text-right">{r.overdue_activities ? <span className="fe-chip fe-chip-red">{r.overdue_activities}</span> : 0}</td>
              <td><button className="text-xs text-[#264494] hover:underline" onClick={() => onOpenEmployee(r.user_id)} data-testid={`open-employee-${r.user_id}`}>View</button></td>
            </tr>))}</tbody>
        </table></div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Functional KPI Performance" testid="dept-functional">
          <table className="fe-table"><thead><tr><th>Employee</th><th className="text-right">KPIs</th><th className="text-right">Weighted score</th><th>Status mix</th></tr></thead>
            <tbody>{d.functional_kpis.map((f) => (
              <tr key={f.user_id}><td>{f.name}<div className="text-[11px] text-slate-400">{f.functional_responsibility}</div></td><td className="text-right">{f.kpi_count}</td>
                <td className="text-right font-semibold">{f.overall_score === null ? "—" : `${f.overall_score}%`}</td>
                <td className="text-xs">{Object.entries(f.status_counts).map(([k, v]) => <span key={k} className="mr-2 whitespace-nowrap">{k.replace("_", " ").toLowerCase()}: <b>{v}</b></span>)}</td></tr>))}</tbody></table>
        </Panel>
        <PipelineFunnel funnel={d.funnel} title="Department Pipeline by Stage" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel title={`Pending Approvals (${d.pending_approvals.target_revisions.length + d.pending_approvals.kpi_actuals_to_validate})`} testid="dept-approvals"
          right={<Link to="/app/targets?tab=targets" className="text-xs text-[#264494] hover:underline">Review →</Link>}>
          <div className="text-sm space-y-2">
            <div className="flex justify-between"><span>Target revisions</span><b>{d.pending_approvals.target_revisions.length}</b></div>
            <div className="flex justify-between"><span>KPI actuals to validate</span><b>{d.pending_approvals.kpi_actuals_to_validate}</b></div>
          </div>
        </Panel>
        <Panel title={`Lost Opportunities (${d.lost_opportunities.length})`} testid="dept-lost">
          {d.lost_opportunities.length ? <ul className="text-sm divide-y divide-slate-100">{d.lost_opportunities.map((o) => <li key={o.id} className="py-1.5 flex justify-between"><span>{o.title}<div className="text-[11px] text-slate-400">{o.won_lost_reason || o.lost_reason || "Reason not recorded"}</div></span><span className="text-xs">{fmtINR(o.value_inr)}</span></li>)}</ul> : <Empty text="No lost opportunities in period." />}
        </Panel>
        <Panel title={`Overdue Actions (${d.overdue_actions.length})`} testid="dept-overdue">
          {d.overdue_actions.length ? <ul className="text-sm divide-y divide-slate-100">{d.overdue_actions.map((a) => <li key={a.id} className="py-1.5">{a.title}</li>)}</ul> : <Empty text="No overdue actions." />}
        </Panel>
      </div>

      <Panel title="Campaign Performance" testid="dept-campaigns">
        {d.campaigns.length ? <table className="fe-table"><thead><tr><th>Campaign</th><th>Channel</th><th>Status</th><th className="text-right">Budget</th><th className="text-right">Spend</th><th className="text-right">Leads</th><th className="text-right">Qualified</th></tr></thead>
          <tbody>{d.campaigns.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.channel}</td><td>{c.status}</td><td className="text-right">{fmtINR(c.budget_inr)}</td><td className="text-right">{fmtINR(c.spend_inr)}</td><td className="text-right">{c.leads}</td><td className="text-right">{c.qualified_leads}</td></tr>)}</tbody></table>
          : <Empty text="No campaigns recorded." />}
      </Panel>
    </div>
  );
}
