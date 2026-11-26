import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errMsg, fmtINR, FY, hasAnyPerm, monthLabel } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import Funnel3D from "@/components/command-center/Funnel3D";
import ProjectDialog from "@/components/projects/ProjectDialog";
import { KpiCard, Panel } from "@/components/dash/ui";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Maximize2,
  Minimize2,
  RefreshCw,
  FolderKanban,
  Plus,
  Flame,
  Sun,
  Snowflake,
  CalendarClock,
  PhoneCall,
  Briefcase,
  SlidersHorizontal,
} from "lucide-react";

const MONTHS = [
  "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
  "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
];
const axisINR = (v) =>
  v >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v;

const PROJ_STYLE = {
  Design: "fe-chip-blue",
  Execution: "fe-chip-purple",
  Commissioning: "fe-chip-orange",
  Completed: "fe-chip-green",
  "On Hold": "fe-chip-red",
};

const TEMP_BADGE = {
  Hot: { cls: "bg-rose-50 text-rose-700 border-rose-200", Icon: Flame },
  Warm: { cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: Sun },
  Cold: { cls: "bg-sky-50 text-sky-700 border-sky-200", Icon: Snowflake },
};

const SLIDES = [
  { id: "all", label: "Executive Overview" },
  { id: "funnel", label: "Revenue & 3D Funnel" },
  { id: "projects", label: "Projects & Finance" },
  { id: "analytics", label: "Team & KPI Analytics" },
];

export default function CommandCenter({ embedded = false }) {
  const { user } = useAuth();
  const rootRef = useRef(null);

  const [data, setData] = useState(null);
  const [users, setUsers] = useState([]);
  const [opps, setOpps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Filters & interactive state
  const [period, setPeriod] = useState("");
  const [empId, setEmpId] = useState("");
  const [chartMode, setChartMode] = useState("monthly"); // monthly | quarterly
  const [pipeTab, setPipeTab] = useState("potential"); // potential | followups | meetings | prospects
  const [presentation, setPresentation] = useState(false);
  const [slide, setSlide] = useState("all");
  const [projModal, setProjModal] = useState({ open: false, project: null });

  const canWriteProj = hasAnyPerm(user, ["MANAGEMENT_BOARD_VIEW", "HOD_VIEW", "SYSTEM_ADMIN", "SALES_OPPORTUNITY_MANAGE", "TARGETS_CONFIGURE"]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const params = {
        fy_code: FY,
        ...(period.startsWith("M:") ? { month: period.slice(2) } : {}),
        ...(period.startsWith("Q:") ? { quarter: period.slice(2) } : {}),
        ...(empId ? { employee_id: empId } : {}),
      };
      const [execRes, usrRes, oppRes] = await Promise.all([
        api.get("/command-center/executive", { params }),
        api.get("/users").catch(() => ({ data: [] })),
        api.get("/opportunities").catch(() => ({ data: [] })),
      ]);
      setData(execRes.data);
      setUsers(usrRes.data);
      setOpps(oppRes.data);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [period, empId]);

  useEffect(() => { load(); }, [load]);

  const enterPresentation = async () => {
    setPresentation(true);
    try {
      if (rootRef.current?.requestFullscreen && !document.fullscreenElement) {
        await rootRef.current.requestFullscreen();
      }
    } catch {}
  };

  const exitPresentation = async () => {
    setPresentation(false);
    setSlide("all");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {}
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && presentation) exitPresentation();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presentation]);

  const periodOpts = useMemo(
    () => [
      { value: "", label: "Full FY 2026–27" },
      ...["Q1", "Q2", "Q3", "Q4"].map((q) => ({ value: `Q:${q}`, label: `Quarter ${q}` })),
      ...MONTHS.map((m) => ({ value: `M:${m}`, label: `${monthLabel(m)} ${m.slice(0, 4)}` })),
    ],
    []
  );

  const rev = data?.revenue_overview || {};
  const funnel = data?.sales_funnel || {};
  const proj = data?.projects_in_hand || {};
  const pipe = data?.pipeline_tracking || {};
  const analytics = data?.analytics || {};

  const chartData = useMemo(() => {
    if (chartMode === "quarterly") {
      return (analytics.quarterly_revenue || []).map((q) => ({ ...q, label: q.quarter }));
    }
    return (analytics.monthly_revenue || []).map((m) => ({ ...m, label: monthLabel(m.month) }));
  }, [analytics, chartMode]);

  const showSection = (group) => slide === "all" || slide === group;

  return (
    <div
      ref={rootRef}
      data-testid="command-center-page"
      className={`${
        presentation
          ? "fixed inset-0 z-50 overflow-y-auto p-5 sm:p-8 bg-[#F4F6F9]"
          : ""
      } text-[#0F172A] space-y-6`}
    >
      <div className="space-y-6 max-w-[1600px] mx-auto">
        {/* ────────── COMMAND CENTER HEADER ────────── */}
        <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3 border-b border-slate-200/90">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live CRM + Finance
              </span>
              <span className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">
                Executive Revenue &amp; KPI Command Center
              </span>
            </div>
            {(!embedded || presentation) && (
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight mt-1 bg-gradient-to-r from-[#262262] via-[#264494] to-[#4F46E5] bg-clip-text text-transparent">
                Executive Revenue &amp; KPI Intelligence
              </h1>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {presentation && (
              <div className="flex items-center gap-1 bg-slate-200/70 border border-slate-200 rounded-xl p-1 mr-1" data-testid="presentation-slides">
                {SLIDES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSlide(s.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      slide === s.id ? "bg-white text-[#262262] shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 bg-white border border-slate-200/90 rounded-xl px-2.5 py-1.5 shadow-2xs">
              <SlidersHorizontal size={13} className="text-[#264494]" />
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
                data-testid="cc-filter-period"
              >
                {periodOpts.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <select
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              className="bg-white border border-slate-200/90 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs focus:outline-none cursor-pointer"
              data-testid="cc-filter-employee"
            >
              <option value="">All Team Members</option>
              {(data?.employees || []).map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>

            <button
              onClick={load}
              className="fe-btn-secondary text-xs py-1.5 px-3"
              data-testid="cc-refresh-btn"
            >
              <RefreshCw size={13} className={loading ? "animate-spin text-[#264494]" : ""} /> Refresh
            </button>

            {presentation ? (
              <button
                onClick={exitPresentation}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-xs font-bold text-rose-700 transition-all cursor-pointer"
                data-testid="cc-exit-presentation"
              >
                <Minimize2 size={14} /> Exit Presentation
              </button>
            ) : (
              <button
                onClick={enterPresentation}
                className="fe-btn-primary text-xs py-1.5 px-3.5"
                data-testid="cc-presentation-btn"
              >
                <Maximize2 size={14} /> Presentation Mode
              </button>
            )}
          </div>
        </header>

        {err && (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
            {err}
          </div>
        )}

        {!data && loading ? (
          <div className="py-24 text-center text-slate-500 text-sm">Loading live Command Center telemetry…</div>
        ) : data && (
          <>
            {/* ────────── 1. REVENUE OVERVIEW INDICATORS ────────── */}
            {showSection("funnel") && (
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5" data-testid="cc-revenue-cards">
                <KpiCard
                  label="Total Revenue Won"
                  value={fmtINR(rev.total_revenue_inr)}
                  sub={
                    <span className="inline-flex items-center gap-2">
                      <span>{rev.won_count} won deal(s)</span>
                      {rev.growth_pct != null && (
                        <span className={`inline-flex items-center gap-0.5 font-bold ${rev.growth_pct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {rev.growth_pct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {rev.growth_pct >= 0 ? "+" : ""}{rev.growth_pct}%
                        </span>
                      )}
                    </span>
                  }
                  accent="#10B981"
                />

                <div className="fe-kpi-card">
                  <span className="absolute top-0 left-0 right-0 h-[4px] rounded-t-2xl" style={{ background: "linear-gradient(90deg, #264494, #007AFF)" }} />
                  <div className="fe-kpi-label">Target vs Achievement</div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="fe-kpi-value text-[22px] lg:text-[26px]">
                      {rev.achievement_pct != null ? `${rev.achievement_pct}%` : "—"}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">of {fmtINR(rev.period_target_inr)}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full mt-2.5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#264494] to-[#007AFF] transition-all duration-700"
                      style={{ width: `${Math.min(rev.achievement_pct || 0, 100)}%` }}
                    />
                  </div>
                </div>

                <KpiCard
                  label="Finance Collections"
                  value={fmtINR(rev.collected_inr)}
                  sub={`Invoiced ${fmtINR(rev.invoiced_inr)} · Due ${fmtINR(rev.outstanding_inr)}`}
                  accent="#007AFF"
                />

                <KpiCard
                  label="Active Pipeline"
                  value={fmtINR(rev.active_pipeline_inr)}
                  sub={`Weighted ${fmtINR(rev.weighted_pipeline_inr)}`}
                  accent="#5856D6"
                />

                <KpiCard
                  label="Win Rate & Avg Deal"
                  value={rev.win_rate_pct != null ? `${rev.win_rate_pct}%` : "—"}
                  sub={`Avg Deal ${fmtINR(rev.avg_deal_size_inr)} · ${rev.lost_count} lost`}
                  accent="#F19A2F"
                />
              </section>
            )}

            {/* ────────── 2. 3D SALES FUNNEL + PIPELINE TRACKING ────────── */}
            {showSection("funnel") && (
              <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                <Panel
                  title="3D Sales Funnel"
                  right={<span className="text-[11px] text-slate-500">Leads → Meetings → Deals → Won</span>}
                  className="xl:col-span-5"
                >
                  <Funnel3D funnel={funnel} />
                </Panel>

                <Panel
                  title="Live Pipeline Tracking"
                  className="xl:col-span-7"
                  right={
                    <div className="flex flex-wrap gap-1 bg-slate-100 border border-slate-200 p-1 rounded-xl" data-testid="cc-pipeline-tabs">
                      {[
                        { id: "potential", label: `Potential (${(pipe.potential_sales || []).length})`, icon: Briefcase },
                        { id: "followups", label: `Follow-ups (${(pipe.followups || []).length})`, icon: PhoneCall },
                        { id: "meetings", label: `Meetings (${(pipe.upcoming_meetings || []).length})`, icon: CalendarClock },
                        { id: "prospects", label: `Prospects (${(pipe.prospects || []).length})`, icon: Flame },
                      ].map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setPipeTab(t.id)}
                          data-testid={`cc-pipe-tab-${t.id}`}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                            pipeTab === t.id ? "bg-white text-[#262262] shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          <t.icon size={12} /> {t.label}
                        </button>
                      ))}
                    </div>
                  }
                >
                  <div className="overflow-x-auto">
                    {pipeTab === "potential" && (
                      <table className="fe-table">
                        <thead>
                          <tr>
                            <th>Opportunity</th>
                            <th>Stage</th>
                            <th>Owner</th>
                            <th className="text-right">Value</th>
                            <th className="text-right">Close Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(pipe.potential_sales || []).map((o) => (
                            <tr key={o.id}>
                              <td>
                                <div className="font-semibold text-slate-800">{o.title}</div>
                                <div className="text-[11px] text-slate-400">{o.account_name}</div>
                              </td>
                              <td><span className="fe-chip fe-chip-blue">{o.stage}</span></td>
                              <td className="text-xs">{o.owner_name}</td>
                              <td className="text-right font-bold text-[#264494]">{fmtINR(o.value_inr)}</td>
                              <td className="text-right text-xs text-slate-500">{o.expected_close_date?.slice(0, 10) || "—"}</td>
                            </tr>
                          ))}
                          {!(pipe.potential_sales || []).length && (
                            <tr><td colSpan={5} className="py-8 text-center text-slate-400 text-xs">No open opportunities in pipeline.</td></tr>
                          )}
                        </tbody>
                      </table>
                    )}

                    {pipeTab === "followups" && (
                      <div className="space-y-2">
                        {(pipe.followups || []).map((a) => (
                          <div key={a.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold text-slate-800">{a.title}</div>
                              <div className="text-[11px] text-slate-500">{a.owner_name} · {a.status}</div>
                            </div>
                            <span className="text-[11px] text-amber-700 font-semibold whitespace-nowrap">
                              {a.start_at ? new Date(a.start_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                            </span>
                          </div>
                        ))}
                        {!(pipe.followups || []).length && <div className="py-8 text-center text-slate-400 text-xs">No pending follow-ups.</div>}
                      </div>
                    )}

                    {pipeTab === "meetings" && (
                      <div className="space-y-2">
                        {(pipe.upcoming_meetings || []).map((a) => (
                          <div key={a.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold text-slate-800">{a.title}</div>
                              <div className="text-[11px] text-slate-500">{a.activity_type} · {a.owner_name}</div>
                            </div>
                            <span className="text-[11px] text-[#264494] font-semibold whitespace-nowrap">
                              {a.start_at ? new Date(a.start_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                            </span>
                          </div>
                        ))}
                        {!(pipe.upcoming_meetings || []).length && <div className="py-8 text-center text-slate-400 text-xs">No upcoming meetings scheduled.</div>}
                      </div>
                    )}

                    {pipeTab === "prospects" && (
                      <table className="fe-table">
                        <thead>
                          <tr>
                            <th>Prospect</th>
                            <th>Temp</th>
                            <th>Status</th>
                            <th>Owner</th>
                            <th className="text-right">Est. Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(pipe.prospects || []).map((l) => {
                            const tb = TEMP_BADGE[l.temperature] || TEMP_BADGE.Warm;
                            const TIcon = tb.Icon;
                            return (
                              <tr key={l.id}>
                                <td>
                                  <div className="font-semibold text-slate-800">{l.name}</div>
                                  <div className="text-[11px] text-slate-400">{l.company}</div>
                                </td>
                                <td>
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${tb.cls}`}>
                                    <TIcon size={10} /> {l.temperature}
                                  </span>
                                </td>
                                <td className="text-xs">{l.status}</td>
                                <td className="text-xs">{l.owner_name}</td>
                                <td className="text-right font-semibold text-[#264494]">{fmtINR(l.estimated_value_inr)}</td>
                              </tr>
                            );
                          })}
                          {!(pipe.prospects || []).length && (
                            <tr><td colSpan={5} className="py-8 text-center text-slate-400 text-xs">No active prospects.</td></tr>
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                </Panel>
              </section>
            )}

            {/* ────────── 3. PROJECTS IN HAND (Design, Execution, Commissioning) ────────── */}
            {showSection("projects") && (
              <Panel
                title={
                  <span className="inline-flex items-center gap-2">
                    <FolderKanban size={17} className="text-[#264494]" />
                    Projects in Hand ({proj.active_projects || 0} active · {fmtINR(proj.total_contract_value_inr)})
                  </span>
                }
                right={
                  canWriteProj && (
                    <button
                      onClick={() => setProjModal({ open: true, project: null })}
                      className="fe-btn-primary text-xs py-1.5 px-3"
                      data-testid="cc-new-project-btn"
                    >
                      <Plus size={14} /> Add Project
                    </button>
                  )
                }
                testid="cc-projects-section"
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(proj.stages || []).filter((s) => ["Design", "Execution", "Commissioning", "Completed"].includes(s.stage)).map((st) => (
                      <div key={st.stage} className="rounded-xl bg-slate-50/90 border border-slate-200/80 p-3.5">
                        <div className="flex items-center justify-between">
                          <span className={`fe-chip ${PROJ_STYLE[st.stage] || "fe-chip-blue"}`}>{st.stage}</span>
                          <span className="text-xl font-extrabold text-[#262262]">{st.count}</span>
                        </div>
                        <div className="text-xs font-bold text-[#264494] mt-2">{fmtINR(st.contract_value_inr)}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">Avg Progress: {st.avg_progress_pct}%</div>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="fe-table">
                      <thead>
                        <tr>
                          <th>Project</th>
                          <th>Stage</th>
                          <th>Progress</th>
                          <th className="text-right">Contract</th>
                          <th className="text-right">Invoiced</th>
                          <th className="text-right">Collected</th>
                          <th>PM</th>
                          {canWriteProj && <th></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {(proj.items || []).map((p) => (
                          <tr key={p.id}>
                            <td>
                              <div className="font-semibold text-slate-800">{p.name}</div>
                              <div className="text-[11px] text-slate-400">{p.project_code} · {p.client_name}</div>
                            </td>
                            <td><span className={`fe-chip ${PROJ_STYLE[p.stage] || "fe-chip-blue"}`}>{p.stage}</span></td>
                            <td className="min-w-[110px]">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-[#264494] to-[#10B981]" style={{ width: `${p.progress_pct || 0}%` }} />
                                </div>
                                <span className="text-[11px] font-semibold text-slate-600">{p.progress_pct || 0}%</span>
                              </div>
                            </td>
                            <td className="text-right font-semibold text-slate-800">{fmtINR(p.contract_value_inr)}</td>
                            <td className="text-right text-slate-600">{fmtINR(p.invoiced_inr)}</td>
                            <td className="text-right font-semibold text-emerald-700">{fmtINR(p.collected_inr)}</td>
                            <td className="text-xs text-slate-600">{p.project_manager_name}</td>
                            {canWriteProj && (
                              <td className="text-right">
                                <button
                                  onClick={() => setProjModal({ open: true, project: p })}
                                  className="text-[#264494] hover:underline font-semibold text-xs"
                                >
                                  Edit
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                        {!(proj.items || []).length && (
                          <tr><td colSpan={8} className="py-6 text-center text-slate-400 text-xs">No engineering projects added yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Panel>
            )}

            {/* ────────── 4. PERFORMANCE ANALYTICS (Monthly/Quarterly + Team Leaderboard) ────────── */}
            {showSection("analytics") && (
              <section className="grid grid-cols-1 xl:grid-cols-12 gap-5" data-testid="cc-analytics-section">
                <Panel
                  title="Revenue & Finance Analytics"
                  className="xl:col-span-6"
                  right={
                    <div className="flex bg-slate-100 border border-slate-200 rounded-xl p-1 text-xs">
                      {["monthly", "quarterly"].map((m) => (
                        <button
                          key={m}
                          onClick={() => setChartMode(m)}
                          data-testid={`cc-chart-${m}`}
                          className={`px-3 py-1 rounded-lg font-semibold capitalize cursor-pointer ${
                            chartMode === m ? "bg-white text-[#262262] shadow-2xs font-bold" : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  }
                >
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#475569" }} />
                      <YAxis tickFormatter={axisINR} tick={{ fontSize: 11, fill: "#475569" }} />
                      <Tooltip
                        formatter={(v) => fmtINR(v)}
                        contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 10, fontSize: 12, color: "#0F172A" }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="target_inr" name="Target" fill="#CBD6F2" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="won_inr" name="Revenue Won" fill="#264494" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="collected_inr" name="Collected" fill="#10B981" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="invoiced_inr" name="Invoiced" stroke="#5856D6" strokeWidth={2.5} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Panel>

                <Panel
                  title="Sales & KPI Team Leaderboard"
                  className="xl:col-span-6"
                  right={
                    <div className="flex gap-1.5 text-[10px]">
                      <span className="fe-chip fe-chip-green">Approved: {analytics.kpi_summary?.approved || 0}</span>
                      <span className="fe-chip fe-chip-orange">Submitted: {analytics.kpi_summary?.submitted || 0}</span>
                    </div>
                  }
                >
                  <div className="overflow-x-auto">
                    <table className="fe-table">
                      <thead>
                        <tr>
                          <th>Member</th>
                          <th className="text-right">Won</th>
                          <th className="text-right">Target Ach.</th>
                          <th className="text-right">Pipeline</th>
                          <th className="text-right">KPI Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(analytics.team_performance || []).map((t) => (
                          <tr key={t.user_id}>
                            <td>
                              <div className="font-semibold text-slate-800">{t.name}</div>
                              <div className="text-[10px] text-slate-400">{t.functional_responsibility || t.designation}</div>
                            </td>
                            <td className="text-right font-bold text-emerald-700">{fmtINR(t.won_inr)}</td>
                            <td className="text-right font-semibold text-[#264494]">
                              {t.achievement_pct != null ? `${t.achievement_pct}%` : "—"}
                            </td>
                            <td className="text-right text-slate-600">{fmtINR(t.pipeline_inr)}</td>
                            <td className="text-right">
                              {t.kpi_score != null ? (
                                <span className="fe-chip fe-chip-blue">
                                  {t.kpi_score}% ({t.kpi_status})
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </section>
            )}
          </>
        )}
      </div>

      {projModal.open && (
        <ProjectDialog
          project={projModal.project}
          users={users}
          opportunities={opps}
          onClose={() => setProjModal({ open: false, project: null })}
          onSaved={() => { setProjModal({ open: false, project: null }); load(); }}
        />
      )}
    </div>
  );
}
