import { fmtINR, monthLabel } from "@/lib/api";
import { Panel, Empty, Progress } from "./ui";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar, PieChart, Pie, Cell, ComposedChart, Area,
} from "recharts";

const COLORS = ["#262262", "#264494", "#51C5DC", "#F19A2F", "#903B96", "#E81B90", "#EAE950", "#10B981", "#EF4444", "#94A3B8"];
const axisINR = (v) => (v >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v);
const tip = { contentStyle: { fontSize: 12, borderRadius: 6 } };

export function TargetVsAchievement({ m }) {
  const t = m.target_inr;
  const curMonth = new Date().toISOString().slice(0, 7);
  const mt = m.monthly_trend?.find((x) => x.month === curMonth);
  return (
    <Panel title="Sales Target vs Achievement" testid="target-vs-achievement">
      {t ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><div className="fe-kpi-label">Target</div><div className="text-lg font-bold text-[#262262]">{fmtINR(t)}</div></div>
            <div><div className="fe-kpi-label">Achieved</div><div className="text-lg font-bold text-emerald-600">{fmtINR(m.confirmed_won_inr)}</div></div>
            <div><div className="fe-kpi-label">Remaining</div><div className="text-lg font-bold text-[#F19A2F]">{fmtINR(m.remaining_inr)}</div></div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1"><span className="text-slate-500">Annual achievement</span><span className="font-bold">{m.achievement_pct ?? 0}%</span></div>
            <Progress pct={m.achievement_pct} color="#264494" height={12} />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">This month ({monthLabel(curMonth)})</span>
              <span className="font-bold">{fmtINR(mt?.won_inr || 0)}{mt?.target_inr ? ` / ${fmtINR(mt.target_inr)}` : ""}</span>
            </div>
            <Progress pct={mt?.target_inr ? (mt.won_inr / mt.target_inr) * 100 : 0} color="#51C5DC" />
            {!mt?.target_inr && <div className="text-[11px] text-slate-400 mt-1">Monthly target not configured.</div>}
          </div>
        </div>
      ) : <Empty text="No approved sales target yet." hint="Your individual target will appear once management approves it." />}
    </Panel>
  );
}

export function MonthlyTrend({ trend }) {
  const data = trend.map((t) => ({ ...t, label: monthLabel(t.month) }));
  const has = data.some((d) => d.won_inr || d.target_inr);
  return (
    <Panel title="Monthly Sales Trend" testid="monthly-trend">
      {has ? (
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={axisINR} />
            <Tooltip formatter={(v) => fmtINR(v)} {...tip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="target_inr" name="Monthly target" fill="#CBD6F2" stroke="#CBD6F2" />
            <Line type="monotone" dataKey="won_inr" name="Confirmed sales" stroke="#264494" strokeWidth={2.5} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : <Empty text="No confirmed sales recorded this financial year." />}
    </Panel>
  );
}

export function PipelineFunnel({ funnel, title = "Sales Pipeline Funnel" }) {
  const has = funnel.some((f) => f.count);
  return (
    <Panel title={title} testid="pipeline-funnel">
      {has ? (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={funnel} layout="vertical" margin={{ left: 20, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={axisINR} />
            <YAxis type="category" dataKey="stage" width={140} tick={{ fontSize: 11, fill: "#475569" }} />
            <Tooltip formatter={(v, n, p) => [`${fmtINR(v)} · ${p.payload.count} opp(s)`, "Value"]} {...tip} />
            <Bar dataKey="value_inr" radius={[0, 4, 4, 0]}>{funnel.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : <Empty text="No opportunities in the pipeline." />}
    </Panel>
  );
}

export function ActivityPerformance({ m }) {
  const data = [
    { name: "Calls", v: m.calls_completed }, { name: "Meetings", v: m.meetings_completed },
    { name: "Follow-ups", v: m.followups_completed }, { name: "Proposals", v: m.proposals_submitted },
    ...m.activity_by_type.filter((a) => !["Sales Call", "Customer Meeting", "Follow-up"].includes(a.type)).map((a) => ({ name: a.type, v: a.count })),
  ];
  return (
    <Panel title="Activity Performance" testid="activity-performance">
      {data.some((d) => d.v) ? (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip {...tip} /><Bar dataKey="v" name="Completed" fill="#264494" radius={[4, 4, 0, 0]} /></BarChart>
        </ResponsiveContainer>
      ) : <Empty text="No completed activities in this period." hint="Calls, meetings and follow-ups logged in Calendar & Activities appear here." />}
    </Panel>
  );
}

export function LeadTrend({ trend, sources }) {
  const data = trend.map((t) => ({ ...t, label: monthLabel(t.month) }));
  return (
    <Panel title="Lead Generation" testid="lead-trend">
      {data.some((d) => d.leads) ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-3">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Line dataKey="leads" name="Leads" stroke="#264494" strokeWidth={2} /><Line dataKey="qualified" name="Qualified" stroke="#10B981" strokeWidth={2} /></LineChart>
            </ResponsiveContainer>
          </div>
          <div className="md:col-span-2">
            <div className="fe-kpi-label mb-1">Lead sources (period)</div>
            {sources.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart><Pie data={sources} dataKey="count" nameKey="source" outerRadius={70} label={{ fontSize: 10 }}>{sources.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip {...tip} /></PieChart>
              </ResponsiveContainer>
            ) : <Empty text="No leads in period." />}
          </div>
        </div>
      ) : <Empty text="No leads registered this financial year." />}
    </Panel>
  );
}

export function Comparison({ rows, ach }) {
  return (
    <Panel title="My Performance vs Department Average" testid="dept-comparison">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm bg-[#DCF3F8] rounded-md px-3 py-2">
          <span className="text-slate-600">Target achievement</span>
          <span><b className="text-[#262262]">{ach.me ?? "—"}{ach.me !== null && "%"}</b> <span className="text-slate-500">vs dept avg {ach.dept_avg ?? "—"}{ach.dept_avg !== null && "%"}</span></span>
        </div>
        {rows.map((r) => {
          const max = Math.max(r.me, r.dept_avg, 1);
          const inr = r.metric.includes("₹");
          return (
            <div key={r.metric}>
              <div className="flex justify-between text-xs mb-1"><span className="text-slate-600">{r.metric}</span>
                <span><b>{inr ? fmtINR(r.me) : r.me}</b> <span className="text-slate-400">/ avg {inr ? fmtINR(r.dept_avg) : r.dept_avg}</span></span></div>
              <div className="relative"><Progress pct={(r.me / max) * 100} color="#264494" height={8} />
                <span className="absolute top-[-2px] w-[2px] h-3 bg-[#F19A2F]" style={{ left: `${(r.dept_avg / max) * 100}%` }} title="Department average" /></div>
            </div>
          );
        })}
        <div className="text-[11px] text-slate-400">Orange marker = department average. Individual figures of colleagues are not shown.</div>
      </div>
    </Panel>
  );
}
