import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errMsg, fmtINR } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { KpiCard, Panel, Empty, Loading } from "./ui";
import { TargetVsAchievement, MonthlyTrend, PipelineFunnel, ActivityPerformance, LeadTrend, Comparison } from "./Charts";
import { KpiAchievementChart, ScorecardTable } from "./Scorecard";
import ActualDialog from "./ActualDialog";

const fmtDT = (s) => (s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

function ActionList({ title, items, render, empty, testid }) {
  return (
    <Panel title={`${title} (${items.length})`} testid={testid}>
      {items.length ? <ul className="divide-y divide-slate-100 -my-2">{items.map((x, i) => <li key={x.id || i} className="py-2 text-sm">{render(x)}</li>)}</ul> : <Empty text={empty} />}
    </Panel>
  );
}

export default function MyPerformance({ userId, filters }) {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [actualItem, setActualItem] = useState(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const params = { fy_code: filters.fy, ...(userId ? { user_id: userId } : {}), ...(filters.month ? { month: filters.month } : {}), ...(filters.quarter ? { quarter: filters.quarter } : {}) };
      const r = await api.get("/dashboard/me", { params });
      setD(r.data);
    } catch (e) { setErr(errMsg(e, "Could not load performance")); }
  }, [userId, filters.fy, filters.month, filters.quarter]);
  useEffect(() => { setD(null); load(); }, [load]);

  if (err) return <Panel><Empty text={err} /></Panel>;
  if (!d) return <Loading text="Loading performance…" />;
  const m = d.metrics, a = d.actions, sc = d.scorecard;
  const isSelf = d.employee.id === user.id;
  const opp = (o) => <div className="flex justify-between gap-2"><span><b className="text-slate-800">{o.title}</b> <span className="text-slate-400">· {o.account_name}</span></span><span className="text-xs text-slate-500 whitespace-nowrap">{o.stage} · {fmtINR(o.value_inr)}</span></div>;
  const act = (x) => <div className="flex justify-between gap-2"><span><b className="text-slate-800">{x.title}</b> <span className="text-slate-400">· {x.activity_type}</span></span><span className="text-xs text-slate-500">{fmtDT(x.start_at)}</span></div>;

  return (
    <div className="space-y-6" data-testid="my-performance">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500">{isSelf ? "My Performance" : "Employee Performance"} · {d.period.start} → {d.period.end}</div>
          <div className="text-xl font-bold text-[#262262]" data-testid="perf-employee-name">{d.employee.name}</div>
          <div className="text-sm text-slate-500">{d.employee.designation}{d.employee.functional_responsibility ? ` · ${d.employee.functional_responsibility}` : ""}</div>
        </div>
        {sc.overall_score !== null && <div className="text-right"><div className="fe-kpi-label">Weighted KPI score</div><div className="text-2xl font-bold text-[#264494]" data-testid="overall-score">{sc.overall_score}%</div></div>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3" data-testid="my-kpi-cards">
        <KpiCard label="Sales Target" value={fmtINR(m.target_inr)} sub={m.target_inr ? "Approved" : "Not yet approved"} testid="card-target" />
        <KpiCard label="Confirmed Sales" value={fmtINR(m.confirmed_won_inr)} sub={`${m.won_count} order(s)`} accent="#10B981" testid="card-confirmed" />
        <KpiCard label="Achievement" value={m.achievement_pct === null ? "—" : `${m.achievement_pct}%`} sub="Confirmed ÷ target" accent="#F19A2F" testid="card-achievement" />
        <KpiCard label="Active Pipeline" value={fmtINR(m.pipeline_inr)} sub={`${m.open_count} open · weighted ${fmtINR(m.weighted_pipeline_inr)}`} accent="#51C5DC" testid="card-pipeline" />
        <KpiCard label="Qualified Leads" value={m.leads_qualified} sub={`of ${m.leads_total} new leads`} accent="#903B96" testid="card-qualified" />
        <KpiCard label="Meetings Completed" value={m.meetings_completed} accent="#264494" testid="card-meetings" />
        <KpiCard label="Proposals Submitted" value={m.proposals_submitted} sub={fmtINR(m.proposal_value_inr)} accent="#262262" testid="card-proposals" />
        <KpiCard label="Win Rate" value={m.win_rate_pct === null ? "—" : `${m.win_rate_pct}%`} sub="Won ÷ (Won + Lost)" accent="#10B981" testid="card-conversion" />
        <KpiCard label="Pending Follow-ups" value={m.followups_pending} accent="#E81B90" testid="card-followups" />
        <KpiCard label="Overdue Activities" value={m.overdue_activities} accent="#EF4444" testid="card-overdue" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <TargetVsAchievement m={{ ...m, monthly_trend: d.fy_metrics.monthly_trend }} />
        <div className="xl:col-span-2"><MonthlyTrend trend={d.fy_metrics.monthly_trend} /></div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <PipelineFunnel funnel={m.funnel} />
        <Panel title="KPI Achievement" right={<Link to="/app/targets" className="text-xs text-[#264494] hover:underline">Full scorecard →</Link>} testid="kpi-achievement">
          <KpiAchievementChart items={sc.items} />
        </Panel>
      </div>

      <Panel title="Functional KPIs" testid="functional-kpis">
        <ScorecardTable items={sc.items} functionalOnly canEnter={isSelf} onEnterActual={setActualItem} testid="functional-kpi-table" />
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ActivityPerformance m={m} />
        <Panel title="Opportunity Progress" testid="opportunity-progress">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <KpiCard label="Open" value={m.open_count} accent="#264494" />
            <KpiCard label="Won" value={m.won_count} accent="#10B981" />
            <KpiCard label="Lost" value={m.lost_count} accent="#EF4444" />
          </div>
          <table className="fe-table"><thead><tr><th>Stage</th><th className="text-right">Opps</th><th className="text-right">Credited value</th></tr></thead>
            <tbody>{m.funnel.filter((f) => f.count).map((f) => <tr key={f.stage}><td>{f.stage}</td><td className="text-right">{f.count}</td><td className="text-right">{fmtINR(f.value_inr)}</td></tr>)}
              {!m.funnel.some((f) => f.count) && <tr><td colSpan={3}><Empty text="No opportunities." /></td></tr>}</tbody></table>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <LeadTrend trend={d.fy_metrics.lead_trend} sources={m.leads_by_source} />
        <Comparison rows={d.comparison} ach={d.achievement_vs_dept} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" data-testid="personal-actions">
        <ActionList title="Today's Activities" items={a.today} render={act} empty="Nothing scheduled today." testid="actions-today" />
        <ActionList title="Upcoming Meetings" items={a.upcoming_meetings} render={act} empty="No upcoming meetings." testid="actions-meetings" />
        <ActionList title="Pending Follow-ups" items={a.pending_followups} render={act} empty="No pending follow-ups." testid="actions-followups" />
        <ActionList title="Overdue Tasks" items={a.overdue} render={act} empty="Nothing overdue." testid="actions-overdue" />
        <ActionList title="Opportunities Needing Attention" items={a.opportunities_attention} render={opp} empty="All opportunities are up to date." testid="actions-attention" />
        <ActionList title="Upcoming Closing Deadlines" items={a.upcoming_deadlines} render={opp} empty="No closures due in 14 days." testid="actions-deadlines" />
      </div>
      <ActionList title="Recent Updates" items={a.recent_updates} empty="No recent updates."
        render={(x) => <div className="flex justify-between gap-2"><span><span className="fe-chip fe-chip-purple mr-2">{x.action}</span>{x.user_name}</span><span className="text-xs text-slate-500">{fmtDT(x.at)}</span></div>} testid="actions-recent" />

      {actualItem && <ActualDialog item={actualItem} onClose={() => setActualItem(null)} onSaved={() => { setActualItem(null); load(); }} />}
    </div>
  );
}
