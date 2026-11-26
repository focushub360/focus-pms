import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errMsg, fmtVal, FY, hasAnyPerm } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, Loading, Panel } from "@/components/dash/ui";
import ReasonDialog from "@/components/dash/ReasonDialog";
import { toast } from "sonner";
import {
  CheckCircle2,
  Lock,
  RefreshCw,
  Send,
  RotateCcw,
  Save,
  ShieldCheck,
  AlertTriangle,
  Clock,
  CalendarPlus,
  X,
} from "lucide-react";

const FY_MONTHS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(Date.UTC(Number(FY.slice(2, 6)), 3 + i, 1));
  return d.toISOString().slice(0, 7);
});
const THIS_MONTH = new Date().toISOString().slice(0, 7);
const SELECTABLE_MONTHS = FY_MONTHS.filter((m) => m <= THIS_MONTH);

const SHEET_STATUS_LABEL = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  RETURNED: "Returned",
};

const SHEET_CHIP = {
  DRAFT: "bg-slate-100 text-slate-700 border border-slate-200",
  SUBMITTED: "bg-amber-50 text-amber-700 border border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  RETURNED: "bg-rose-50 text-rose-700 border border-rose-200",
};

const KPI_STATUS_CHIP = {
  "On Track": "bg-emerald-50 text-emerald-700 border border-emerald-200",
  Watch: "bg-amber-50 text-amber-700 border border-amber-200",
  "At Risk": "bg-rose-50 text-rose-700 border border-rose-200",
  Pending: "bg-slate-100 text-slate-600 border border-slate-200",
  Deactive: "bg-slate-100 text-slate-400 border border-slate-200",
};

function computeRowLive(k, actualVal, targetVal, weightVal, th) {
  const isActive = Boolean(k.is_active);
  const onTrackTh = Number(th?.achieved ?? 100);
  const watchTh = Number(th?.on_track ?? 80);
  const capPct = Number(th?.achievement_cap ?? 120);

  const actual = actualVal === "" || actualVal === null || actualVal === undefined ? null : Number(actualVal);
  const target = targetVal === "" || targetVal === null || targetVal === undefined ? null : Number(targetVal);
  const weight = weightVal === "" || weightVal === null || weightVal === undefined ? 0 : Number(weightVal);

  let rawAch = null;
  if (actual !== null && target !== null && target > 0) {
    if (k.direction === "lower") rawAch = actual > 0 ? Math.round((target / actual) * 10000) / 100 : 100;
    else rawAch = Math.round((actual / target) * 10000) / 100;
  }

  const cappedAch = rawAch !== null ? Math.min(rawAch, capPct) : null;
  const weightedScore =
    cappedAch !== null && isActive && weight > 0
      ? Math.round((cappedAch / 100) * weight * 100) / 100
      : isActive
      ? 0
      : null;

  let status = "Deactive";
  if (isActive) {
    if (actual === null || target === null || target <= 0 || rawAch === null) status = "Pending";
    else if (rawAch >= onTrackTh) status = "On Track";
    else if (rawAch >= watchTh) status = "Watch";
    else status = "At Risk";
  }

  return { isActive, actual, target, weight, rawAch, cappedAch, capPct, weightedScore, status };
}

function WeeklyProgressModal({ sheet, kpi, canEdit, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekLabel, setWeekLabel] = useState("Week 1");
  const [updateDate, setUpdateDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [progressValue, setProgressValue] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/monthly-kpis/weekly-logs", {
        params: { user_id: sheet.user_id, month: sheet.month, kpi_code: kpi.kpi_code },
      });
      setLogs(r.data);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [sheet.user_id, sheet.month, kpi.kpi_code]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const submitLog = async (e) => {
    e.preventDefault();
    if (progressValue === "" || Number(progressValue) < 0) return toast.error("Enter a valid non-negative progress value");
    setSaving(true);
    try {
      await api.post("/monthly-kpis/weekly-log", {
        user_id: sheet.user_id,
        month: sheet.month,
        kpi_code: kpi.kpi_code,
        week_label: weekLabel,
        update_date: updateDate,
        progress_value: Number(progressValue),
        remarks,
      });
      toast.success(`Logged ${weekLabel} progress for ${kpi.kpi_name}`);
      setProgressValue("");
      setRemarks("");
      loadLogs();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-5 space-y-4"
        data-testid="weekly-progress-modal"
      >
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-[#262262]">Weekly Progress · {kpi.kpi_name}</h3>
            <p className="text-[11px] text-slate-500">
              {sheet.user_name} · {sheet.month} · Target: {fmtVal(kpi.target, kpi.unit)}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        {canEdit && (
          <form onSubmit={submitLog} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500">Week</label>
              <select className="fe-input !py-1 !text-xs mt-0.5" value={weekLabel} onChange={(e) => setWeekLabel(e.target.value)}>
                {["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"].map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500">Update Date</label>
              <input type="date" className="fe-input !py-1 !text-xs mt-0.5" value={updateDate} onChange={(e) => setUpdateDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500">Progress ({kpi.unit})</label>
              <input
                type="number"
                min="0"
                step="any"
                required
                className="fe-input !py-1 !text-xs mt-0.5"
                value={progressValue}
                onChange={(e) => setProgressValue(e.target.value)}
                data-testid="weekly-log-value"
              />
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={saving} className="fe-btn-primary !py-1.5 !text-xs w-full" data-testid="weekly-log-submit">
                {saving ? "Saving…" : "+ Log Update"}
              </button>
            </div>
            <div className="sm:col-span-4">
              <input
                type="text"
                placeholder="Remarks / milestones / blockers…"
                className="fe-input !py-1 !text-xs"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>
          </form>
        )}

        <div className="max-h-60 overflow-y-auto fe-scroll">
          {loading ? (
            <Loading text="Loading weekly history…" />
          ) : logs.length ? (
            <table className="fe-table !min-w-0 text-xs">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Week</th>
                  <th className="text-right">Progress</th>
                  <th>Remarks</th>
                  <th>Updated By</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td>{l.update_date}</td>
                    <td className="font-semibold text-[#262262]">{l.week_label}</td>
                    <td className="text-right font-bold">{fmtVal(l.progress_value, l.unit)}</td>
                    <td className="text-slate-600">{l.remarks || "—"}</td>
                    <td className="text-slate-500">{l.updated_by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty text="No weekly progress updates logged yet for this KPI." />
          )}
        </div>
      </div>
    </div>
  );
}

export default function MonthlyScorecardWorkspace({ employees = [] }) {
  const { user } = useAuth();
  const isHodOrAdmin = hasAnyPerm(user, ["HOD_VIEW", "TARGETS_CONFIGURE", "SYSTEM_ADMIN"]);
  const canViewOthers = hasAnyPerm(user, ["HOD_VIEW", "TARGETS_CONFIGURE", "MANAGEMENT_BOARD_VIEW", "TEAM_PERFORMANCE_VIEW", "SYSTEM_ADMIN"]);

  const [uid, setUid] = useState(user.id);
  const [month, setMonth] = useState(() => SELECTABLE_MONTHS[SELECTABLE_MONTHS.length - 1] || FY_MONTHS[0]);
  const [thresholds, setThresholds] = useState({ achieved: 100, on_track: 80, at_risk: 60, achievement_cap: 120 });
  const [templates, setTemplates] = useState([]);
  const [sheet, setSheet] = useState(null);
  const [queue, setQueue] = useState([]);
  const [toggleReqs, setToggleReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [validationErrors, setValidationErrors] = useState([]);

  // Inline drafts
  const [actualDraft, setActualDraft] = useState({});
  const [targetDraft, setTargetDraft] = useState({});
  const [weightDraft, setWeightDraft] = useState({});
  const [weeklyNotes, setWeeklyNotes] = useState({ w1: "", w2: "", w3: "", w4: "", w5: "" });

  // Modals
  const [askDialog, setAskDialog] = useState(null);
  const [toggleAsk, setToggleAsk] = useState(null);
  const [weeklyModalKpi, setWeeklyModalKpi] = useState(null);

  const loadMeta = useCallback(() => {
    api.get("/monthly-kpis/templates").then((r) => setTemplates(r.data)).catch(() => {});
    api.get("/settings/kpi-thresholds").then((r) => setThresholds(r.data)).catch(() => {});
    api.get("/monthly-kpis/queue").then((r) => setQueue(r.data)).catch(() => setQueue([]));
    api.get("/monthly-kpis/toggle-requests").then((r) => setToggleReqs(r.data)).catch(() => setToggleReqs([]));
  }, []);

  const hydrateDrafts = (s) => {
    const ad = {}, td = {}, wg = {};
    for (const k of s.kpis || []) {
      ad[k.kpi_code] = k.actual ?? "";
      td[k.kpi_code] = k.target ?? "";
      wg[k.kpi_code] = k.weight ?? "";
    }
    setActualDraft(ad);
    setTargetDraft(td);
    setWeightDraft(wg);
    setWeeklyNotes({
      w1: s.weekly_notes?.w1 || "",
      w2: s.weekly_notes?.w2 || "",
      w3: s.weekly_notes?.w3 || "",
      w4: s.weekly_notes?.w4 || "",
      w5: s.weekly_notes?.w5 || "",
    });
  };

  const loadSheet = useCallback(async () => {
    setLoading(true);
    setErr("");
    setValidationErrors([]);
    try {
      const r = await api.get("/monthly-kpis", { params: { user_id: uid, month } });
      setSheet(r.data);
      hydrateDrafts(r.data);
    } catch (e) {
      setErr(errMsg(e));
      setSheet(null);
    } finally {
      setLoading(false);
    }
  }, [uid, month]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadSheet(); }, [loadSheet]);

  const isSelf = uid === user.id;
  const isLocked = Boolean(sheet?.locked || sheet?.status === "SUBMITTED" || sheet?.status === "APPROVED");
  const canEditActuals = !isLocked && (isSelf || user.is_super_admin);
  const canConfigTargets = !isLocked && isHodOrAdmin && (!isSelf || user.is_super_admin);
  const canApproveSelected =
    sheet &&
    sheet.user_id !== user.id &&
    (sheet.approver_id === user.id || hasAnyPerm(user, ["HOD_VIEW", "SYSTEM_ADMIN"]));

  const liveSummary = useMemo(() => {
    if (!sheet) return { weightTotal: 0, remainingWeight: 100, weightedScore: 0, overallScore: 0, activeCount: 0, completedCount: 0, onTrack: 0 };
    let weightTotal = 0;
    let weightedScore = 0;
    let activeCount = 0;
    let completedCount = 0;
    let onTrack = 0;
    for (const k of sheet.kpis || []) {
      const p = computeRowLive(k, actualDraft[k.kpi_code], targetDraft[k.kpi_code], weightDraft[k.kpi_code], thresholds);
      if (p.isActive) {
        activeCount += 1;
        weightTotal += p.weight;
        weightedScore += p.weightedScore || 0;
        if (p.actual !== null) completedCount += 1;
        if (p.status === "On Track") onTrack += 1;
      }
    }
    const wt = Math.round(weightTotal * 100) / 100;
    const capPct = Number(thresholds.achievement_cap ?? 120);
    const overallScore = wt > 0 ? Math.round(Math.min((weightedScore / wt) * 100, capPct) * 100) / 100 : 0;
    return {
      weightTotal: wt,
      remainingWeight: Math.round((100 - wt) * 100) / 100,
      weightedScore: Math.round(weightedScore * 100) / 100,
      overallScore,
      activeCount,
      completedCount,
      onTrack,
    };
  }, [sheet, actualDraft, targetDraft, weightDraft, thresholds]);

  const saveMonthlyActualsAndNotes = async () => {
    if (!sheet) return;
    setBusy(true);
    setValidationErrors([]);
    try {
      const entries = (sheet.kpis || [])
        .filter((k) => k.is_active)
        .map((k) => {
          const val = actualDraft[k.kpi_code];
          return {
            kpi_code: k.kpi_code,
            actual: val === "" || val === null || val === undefined ? null : Number(val),
          };
        });
      await api.put("/monthly-kpis/actuals", { user_id: uid, month, entries });
      const r = await api.put("/monthly-kpis/weekly-notes", { user_id: uid, month, notes: weeklyNotes });
      setSheet(r.data);
      hydrateDrafts(r.data);
      toast.success("Monthly KPI actuals & weekly progress notes saved");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const saveWeeklyNotesOnly = async () => {
    if (!sheet) return;
    setBusy(true);
    try {
      const r = await api.put("/monthly-kpis/weekly-notes", { user_id: uid, month, notes: weeklyNotes });
      setSheet(r.data);
      toast.success("Weekly progress notes saved");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const saveConfig = async (customItems = null, nextTemplate = null) => {
    if (!sheet) return;
    setBusy(true);
    setValidationErrors([]);
    try {
      const items =
        customItems ||
        (sheet.kpis || []).map((k) => ({
          kpi_code: k.kpi_code,
          target: targetDraft[k.kpi_code] === "" ? 0 : Number(targetDraft[k.kpi_code]),
          weight: weightDraft[k.kpi_code] === "" ? 0 : Number(weightDraft[k.kpi_code]),
        }));
      const r = await api.put("/monthly-kpis/config", {
        user_id: uid,
        month,
        ...(nextTemplate ? { template_code: nextTemplate } : {}),
        items,
      });
      setSheet(r.data);
      hydrateDrafts(r.data);
      toast.success(nextTemplate ? "Role KPI template updated" : "KPI configuration saved");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (k) => {
    if (isLocked) return;
    const desired = !k.is_active;
    if (isHodOrAdmin || k.is_optional || k.is_project_kpi) {
      await saveConfig([{ kpi_code: k.kpi_code, is_active: desired }]);
      return;
    }
    setToggleAsk({ kpi: k, desiredActive: desired });
  };

  const sendToggleRequest = async (reason) => {
    if (!toggleAsk) return;
    setBusy(true);
    try {
      await api.post("/monthly-kpis/toggle-request", {
        month,
        kpi_code: toggleAsk.kpi.kpi_code,
        desired_active: toggleAsk.desiredActive,
        reason,
      });
      toast.success("KPI activation/deactivation request sent to HOD");
      loadMeta();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const decideToggleReq = async (reqId, approve) => {
    setBusy(true);
    try {
      await api.post(`/monthly-kpis/toggle-requests/${reqId}/decide`, { approve, comment: approve ? "Approved" : "Declined" });
      toast.success(approve ? "KPI toggle request approved" : "KPI toggle request declined");
      loadMeta();
      loadSheet();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const syncCrm = async () => {
    setBusy(true);
    try {
      const r = await api.post("/monthly-kpis/sync-crm", { user_id: uid, month });
      setSheet(r.data);
      hydrateDrafts(r.data);
      toast.success(`CRM actuals synced for ${month}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const submitMonthly = async () => {
    setBusy(true);
    setValidationErrors([]);
    try {
      if (canEditActuals) {
        const entries = (sheet.kpis || [])
          .filter((k) => k.is_active)
          .map((k) => {
            const val = actualDraft[k.kpi_code];
            return {
              kpi_code: k.kpi_code,
              actual: val === "" || val === null || val === undefined ? null : Number(val),
            };
          });
        await api.put("/monthly-kpis/actuals", { user_id: uid, month, entries });
        await api.put("/monthly-kpis/weekly-notes", { user_id: uid, month, notes: weeklyNotes });
      }
      const r = await api.post("/monthly-kpis/submit", { month, comment: "" });
      setSheet(r.data);
      hydrateDrafts(r.data);
      loadMeta();
      toast.success(`Monthly scorecard for ${month} submitted for HOD approval`);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      if (detail && typeof detail === "object" && Array.isArray(detail.errors)) {
        setValidationErrors(detail.errors);
        toast.error(detail.message || "Please fix highlighted fields before submitting");
      } else {
        toast.error(errMsg(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const decideSheet = async (action, comment = "") => {
    if (!sheet) return;
    setBusy(true);
    try {
      const r = await api.post(`/monthly-kpis/${sheet.id}/${action}`, { comment });
      setSheet(r.data);
      hydrateDrafts(r.data);
      loadMeta();
      toast.success(
        action === "approve"
          ? "Scorecard approved & locked"
          : action === "return"
          ? "Scorecard returned for correction"
          : "Scorecard reopened for revision"
      );
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const pendingToggleReqs = toggleReqs.filter((r) => r.status === "PENDING");
  const invalidFieldSet = useMemo(() => new Set(validationErrors.map((e) => `${e.kpi_code}:${e.field}`)), [validationErrors]);

  // Scorecard shows all regular KPIs + any optional KPIs that are currently active (or have historical values)
  const scorecardRows = useMemo(() => {
    if (!sheet) return [];
    return (sheet.kpis || []).filter(
      (k) => !k.is_optional || k.is_active || k.actual !== null || Number(k.weight || 0) > 0
    );
  }, [sheet]);

  const optionalLibraryRows = useMemo(() => {
    if (!sheet) return [];
    return (sheet.kpis || []).filter((k) => k.is_optional);
  }, [sheet]);

  const weeksNotedCount = useMemo(
    () => ["w1", "w2", "w3", "w4", "w5"].filter((w) => (weeklyNotes[w] || "").trim().length > 0).length,
    [weeklyNotes]
  );

  const canSubmitReady = isSelf && !isLocked && Math.abs(liveSummary.weightTotal - 100) < 0.01;

  return (
    <div className="space-y-4" data-testid="monthly-kpi-workspace">
      {/* HOD Pending Approvals & Toggle Requests */}
      {(queue.length > 0 || (isHodOrAdmin && pendingToggleReqs.length > 0)) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {queue.length > 0 && (
            <Panel title={`Pending HOD Scorecard Approvals (${queue.length})`} testid="monthly-kpi-queue">
              <div className="divide-y divide-slate-100">
                {queue.map((q) => (
                  <div key={q.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{q.user_name}</span>
                      <span className="fe-chip fe-chip-blue">{q.month}</span>
                      <span className="font-bold text-[#264494]">{q.overall_score}%</span>
                    </div>
                    <button
                      onClick={() => { setUid(q.user_id); setMonth(q.month); }}
                      className="fe-btn-secondary !py-1 !px-2.5 !text-xs"
                      data-testid={`review-queue-${q.id}`}
                    >
                      Review →
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {isHodOrAdmin && pendingToggleReqs.length > 0 && (
            <Panel title={`KPI Activation / Deactivation Requests (${pendingToggleReqs.length})`} testid="toggle-requests-queue">
              <div className="divide-y divide-slate-100">
                {pendingToggleReqs.map((rq) => (
                  <div key={rq.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-semibold text-slate-800">{rq.user_name}</span> ·{" "}
                      <span className="font-medium text-[#264494]">{rq.desired_active ? "Activate" : "Deactivate"} {rq.kpi_name}</span>
                      <div className="text-[11px] text-slate-500">“{rq.reason}” ({rq.month})</div>
                    </div>
                    {rq.user_id !== user.id && (
                      <div className="flex gap-1.5">
                        <button onClick={() => decideToggleReq(rq.id, true)} className="fe-btn-primary !py-1 !px-2.5 !text-xs">Approve</button>
                        <button onClick={() => decideToggleReq(rq.id, false)} className="fe-btn-secondary !py-1 !px-2.5 !text-xs">Decline</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* ────────── TOP FILTER & ACTION BAR (Screenshot-matched) ────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Employee</label>
            {canViewOthers && employees.length > 1 ? (
              <select
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                data-testid="mkpi-employee-select"
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 min-w-[170px] shadow-2xs focus:outline-none focus:border-[#007AFF]"
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 min-w-[170px]">
                {sheet?.user_name || user.name}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Role</label>
            {canConfigTargets && templates.length > 0 && sheet ? (
              <select
                value={sheet.template_code}
                onChange={(e) => saveConfig(null, e.target.value)}
                data-testid="mkpi-template-select"
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 min-w-[180px] shadow-2xs focus:outline-none focus:border-[#007AFF]"
              >
                {templates.map((t) => (
                  <option key={t.code} value={t.code}>{t.label}</option>
                ))}
              </select>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 min-w-[170px]">
                {sheet?.template_label || sheet?.designation || "Team Member"}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Scorecard Month</label>
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              data-testid="mkpi-month-select"
              className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 shadow-2xs focus:outline-none focus:border-[#007AFF]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isLocked && (
            <button
              type="button"
              onClick={syncCrm}
              disabled={busy}
              className="bg-white hover:bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
              data-testid="mkpi-sync-crm"
            >
              <RefreshCw size={13} /> Sync CRM
            </button>
          )}
          {canEditActuals && (
            <button
              type="button"
              onClick={saveMonthlyActualsAndNotes}
              disabled={busy}
              className="bg-white hover:bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
              data-testid="mkpi-save-actuals"
            >
              <Save size={13} /> Save progress
            </button>
          )}
          {isSelf && !isLocked && (
            <button
              type="button"
              onClick={submitMonthly}
              disabled={busy}
              data-testid="mkpi-submit"
              className={`rounded-xl px-4 py-2 text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                canSubmitReady
                  ? "bg-[#264494] hover:bg-[#1E3678] text-white shadow-sm"
                  : "bg-[#93B4F5] hover:bg-[#7CA3F2] text-white"
              }`}
            >
              <Send size={13} /> Submit monthly scorecard
            </button>
          )}
          {canApproveSelected && sheet?.status === "SUBMITTED" && (
            <>
              <button
                type="button"
                onClick={() => decideSheet("approve", "Approved")}
                disabled={busy}
                className="fe-btn-primary !py-2 !px-3.5 !text-xs"
                data-testid="mkpi-approve"
              >
                <ShieldCheck size={13} /> Approve &amp; Lock
              </button>
              <button
                type="button"
                onClick={() => setAskDialog("return")}
                disabled={busy}
                className="bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 rounded-xl px-3 py-2 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                data-testid="mkpi-return"
              >
                <RotateCcw size={13} /> Return
              </button>
            </>
          )}
          {canApproveSelected && sheet?.status === "APPROVED" && (
            <button
              type="button"
              onClick={() => setAskDialog("reopen")}
              disabled={busy}
              className="bg-white hover:bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
              data-testid="mkpi-reopen"
            >
              <RotateCcw size={13} /> Reopen
            </button>
          )}
        </div>
      </div>

      {/* Status & Validation Alerts */}
      {sheet?.status === "APPROVED" && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 flex items-center gap-2.5 text-xs text-emerald-900" data-testid="mkpi-locked-banner">
          <Lock size={15} className="text-emerald-600 shrink-0" />
          <div>
            <b>Approved &amp; Locked</b> by {sheet.decided_by_name || sheet.approver_name}
            {sheet.decision_comment ? ` — “${sheet.decision_comment}”` : ""}. Historical records are retained and locked.
          </div>
        </div>
      )}
      {sheet?.status === "SUBMITTED" && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 flex items-center gap-2.5 text-xs text-amber-900" data-testid="mkpi-submitted-banner">
          <Clock size={15} className="text-amber-600 shrink-0" />
          <div><b>Submitted for HOD Approval</b> to {sheet.approver_name}. Editing is locked while under review.</div>
        </div>
      )}
      {sheet?.status === "RETURNED" && sheet.decision_comment && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 flex items-center gap-2.5 text-xs text-rose-900" data-testid="mkpi-returned-banner">
          <AlertTriangle size={15} className="text-rose-600 shrink-0" />
          <div><b>Returned for Correction</b> by {sheet.decided_by_name || "HOD"}: “{sheet.decision_comment}”</div>
        </div>
      )}
      {validationErrors.length > 0 && (
        <div className="rounded-xl bg-rose-50 border border-rose-300 px-4 py-2.5 text-xs text-rose-900 space-y-1" data-testid="mkpi-validation-errors">
          <div className="font-bold flex items-center gap-1.5 text-rose-700">
            <AlertTriangle size={14} /> Please fix the following before submitting:
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {validationErrors.map((ve, i) => <li key={i}>{ve.message}</li>)}
          </ul>
        </div>
      )}

      {err && <Panel><Empty text={err} /></Panel>}
      {loading && <Loading text="Loading monthly KPI scorecard…" />}

      {!loading && sheet && (
        <>
          {/* ────────── 4 CLEAN SUMMARY CARDS (Screenshot-matched) ────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5" data-testid="mkpi-summary-cards">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs" data-testid="mkpi-overall-score">
              <div className="text-xs font-medium text-slate-500">Monthly weighted score</div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">{liveSummary.overallScore.toFixed(1)}%</div>
              <div className="text-[11px] text-slate-400 mt-1">Based on active KPI weights and achievement</div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs" data-testid="mkpi-weight-total">
              <div className="text-xs font-medium text-slate-500">Weight allocation</div>
              <div className={`text-2xl font-extrabold mt-1 ${Math.abs(liveSummary.weightTotal - 100) < 0.01 ? "text-slate-900" : "text-rose-600"}`}>
                {liveSummary.weightTotal.toFixed(1)}%
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {Math.abs(liveSummary.weightTotal - 100) < 0.01
                  ? "Active KPI weights must total 100%"
                  : liveSummary.remainingWeight > 0
                  ? `${liveSummary.remainingWeight}% remaining to reach 100%`
                  : `${Math.abs(liveSummary.remainingWeight)}% excess over 100%`}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs" data-testid="mkpi-on-track-card">
              <div className="text-xs font-medium text-slate-500">KPIs on track</div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">
                {liveSummary.onTrack} / {liveSummary.activeCount}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Achievement at or above target</div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs" data-testid="mkpi-submission-card">
              <div className="text-xs font-medium text-slate-500">Submission status</div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1" data-testid="mkpi-status-badge">
                {SHEET_STATUS_LABEL[sheet.status] || sheet.status}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {isLocked ? `Approver: ${sheet.approver_name || "HOD"}` : "Complete active KPI targets and actuals; allocate 100% weight"}
              </div>
            </div>
          </div>

          {/* ────────── MONTHLY KPI SCORECARD TABLE (Screenshot-matched) ────────── */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden" data-testid="mkpi-table-panel">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Monthly KPI scorecard</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter monthly target, final actual and weight. Update progress weekly; submit once at month-end.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-slate-400 hidden lg:inline">
                  Use the Active / Deactive control to decide which KPIs are included in the monthly score
                </span>
                {canConfigTargets && (
                  <button
                    type="button"
                    onClick={() => saveConfig()}
                    disabled={busy}
                    className="bg-white hover:bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 cursor-pointer"
                    data-testid="mkpi-save-config"
                  >
                    Save Targets &amp; Weights
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[900px]" data-testid="mkpi-table">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">KPI</th>
                    <th className="py-3 px-3">Freq.</th>
                    <th className="py-3 px-3">Source</th>
                    <th className="py-3 px-3">Target</th>
                    <th className="py-3 px-3">Actual</th>
                    <th className="py-3 px-3">Ach. %</th>
                    <th className="py-3 px-3">Weight</th>
                    <th className="py-3 px-3">Score</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-4 text-right">Active / Deactive</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {scorecardRows.map((k) => {
                    const p = computeRowLive(k, actualDraft[k.kpi_code], targetDraft[k.kpi_code], weightDraft[k.kpi_code], thresholds);
                    const isCapped = p.rawAch !== null && p.rawAch > p.capPct;
                    const badTarget = invalidFieldSet.has(`${k.kpi_code}:target`);
                    const badActual = invalidFieldSet.has(`${k.kpi_code}:actual`);

                    return (
                      <tr
                        key={k.kpi_code}
                        className={!k.is_active ? "bg-slate-50/70 opacity-60" : "hover:bg-slate-50/40"}
                        data-testid={`mkpi-row-${k.kpi_code}`}
                      >
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{k.kpi_name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {k.kpi_group === "Sales & BD" && (
                              <span className="text-[10px] font-semibold text-indigo-600">Sales &amp; BD</span>
                            )}
                            {k.is_optional && (
                              <span className="text-[10px] font-semibold text-amber-600">Optional</span>
                            )}
                            {k.is_active && (
                              <button
                                type="button"
                                onClick={() => setWeeklyModalKpi(k)}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#264494] hover:underline cursor-pointer"
                                data-testid={`mkpi-weekly-btn-${k.kpi_code}`}
                              >
                                <CalendarPlus size={11} /> Weekly log
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-slate-600 whitespace-nowrap">{k.frequency}</td>
                        <td className="py-3 px-3 text-slate-600 max-w-[170px]">{k.source || k.data_source}</td>

                        <td className="py-3 px-3">
                          {canConfigTargets && k.is_active ? (
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="Target"
                              value={targetDraft[k.kpi_code] ?? ""}
                              onChange={(e) => setTargetDraft({ ...targetDraft, [k.kpi_code]: e.target.value })}
                              className={`w-24 px-2.5 py-1.5 rounded-lg border bg-white text-xs text-slate-800 outline-none focus:border-[#007AFF] ${
                                badTarget ? "border-rose-500 ring-2 ring-rose-100" : "border-slate-200"
                              }`}
                              data-testid={`mkpi-target-${k.kpi_code}`}
                            />
                          ) : (
                            <div className="w-24 px-2.5 py-1.5 rounded-lg border border-slate-200/80 bg-slate-50/70 text-xs text-slate-700">
                              {p.target !== null ? fmtVal(p.target, k.unit) : "Target"}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3">
                          {canEditActuals && k.is_active ? (
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="Actual"
                              value={actualDraft[k.kpi_code] ?? ""}
                              onChange={(e) => setActualDraft({ ...actualDraft, [k.kpi_code]: e.target.value })}
                              className={`w-24 px-2.5 py-1.5 rounded-lg border bg-white text-xs text-slate-800 outline-none focus:border-[#007AFF] ${
                                badActual ? "border-rose-500 ring-2 ring-rose-100" : "border-slate-200"
                              }`}
                              data-testid={`mkpi-actual-${k.kpi_code}`}
                            />
                          ) : (
                            <div className="w-24 px-2.5 py-1.5 rounded-lg border border-slate-200/80 bg-slate-50/70 text-xs text-slate-700">
                              {p.actual !== null ? fmtVal(p.actual, k.unit) : "Actual"}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap text-slate-700">
                          {!k.is_active || p.rawAch === null ? "—" : (
                            <div>
                              <span className="font-semibold">{p.rawAch}%</span>
                              {isCapped && <div className="text-[10px] font-semibold text-amber-600">cap {p.capPct}%</div>}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3">
                          {canConfigTargets && k.is_active ? (
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={weightDraft[k.kpi_code] ?? ""}
                              onChange={(e) => setWeightDraft({ ...weightDraft, [k.kpi_code]: e.target.value })}
                              className="w-16 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 outline-none focus:border-[#007AFF]"
                              data-testid={`mkpi-weight-${k.kpi_code}`}
                            />
                          ) : (
                            <div className="w-16 px-2.5 py-1.5 rounded-lg border border-slate-200/80 bg-slate-50/70 text-xs text-slate-700">
                              {p.weight}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap font-semibold text-slate-800">
                          {!k.is_active || p.weightedScore === null || p.rawAch === null ? "—" : p.weightedScore}
                        </td>

                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                              KPI_STATUS_CHIP[p.status] || KPI_STATUS_CHIP.Pending
                            }`}
                            data-testid={`mkpi-row-status-${k.kpi_code}`}
                          >
                            {p.status}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            disabled={isLocked || busy}
                            onClick={() => handleToggleActive(k)}
                            data-testid={`mkpi-toggle-${k.kpi_code}`}
                            className={`px-3 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                              k.is_active
                                ? "bg-white hover:bg-slate-50 border-slate-200 text-slate-800"
                                : "bg-blue-50 hover:bg-blue-100 border-blue-200 text-[#264494]"
                            }`}
                          >
                            {k.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ────────── OPTIONAL KPI LIBRARY (Screenshot 2) ────────── */}
          {optionalLibraryRows.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4" data-testid="optional-kpi-library">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Optional KPI library</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Optional KPIs can be activated or deactivated using the control in the scorecard. Once activated, enter a target, actual and weight; only active KPIs are included in scoring.
                  </p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold">
                  Inactive by default
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {optionalLibraryRows.map((k) => (
                  <div
                    key={k.kpi_code}
                    className="rounded-xl border border-slate-200/90 px-4 py-3 flex items-center justify-between gap-3 bg-white hover:border-slate-300 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">{k.kpi_name}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                        Source: {k.source || "Project tracker"} · {k.frequency}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          k.is_active
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {k.is_active ? "Active" : "Inactive"}
                      </span>
                      {!isLocked && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleToggleActive(k)}
                          data-testid={`opt-toggle-${k.kpi_code}`}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
                        >
                          {k.is_active ? "Deactivate" : "Activate"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-blue-50/70 border border-blue-100 px-4 py-2.5 text-xs text-blue-700">
                Keep optional KPIs inactive until the work is relevant. Deactivated KPIs remain visible in the scorecard but are excluded from monthly scoring.
              </div>
            </div>
          )}

          {/* ────────── WEEKLY PROGRESS NOTES (Week 1–5, Screenshot 2) ────────── */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4" data-testid="weekly-progress-notes">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Weekly progress notes</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Record key progress, blockers or evidence. These notes do not create separate weekly scorecards.
                </p>
              </div>
              {canEditActuals && (
                <button
                  type="button"
                  onClick={saveWeeklyNotesOnly}
                  disabled={busy}
                  className="bg-white hover:bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 cursor-pointer"
                  data-testid="save-weekly-notes-btn"
                >
                  Save notes
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {[1, 2, 3, 4, 5].map((num) => {
                const wk = `w${num}`;
                return (
                  <div key={wk} className="rounded-xl border border-slate-200/90 p-3 bg-white space-y-1.5">
                    <div className="text-xs font-bold text-slate-900">Week {num}</div>
                    <div className="text-[11px] text-slate-400">Progress / blockers / evidence</div>
                    <input
                      type="text"
                      disabled={!canEditActuals}
                      placeholder="Enter weekly update"
                      value={weeklyNotes[wk] || ""}
                      onChange={(e) => setWeeklyNotes({ ...weeklyNotes, [wk]: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-white focus:outline-none focus:border-[#007AFF] disabled:bg-slate-50"
                      data-testid={`weekly-note-${wk}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* ────────── BOTTOM 2-COLUMN SUMMARY & APPROVAL WORKFLOW (Screenshot 2) ────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900">Monthly performance summary</h3>
              <p className="text-xs text-slate-400 mt-0.5 mb-3">Calculated from active KPI rows</p>
              <div className="divide-y divide-slate-100 text-xs">
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600">Active KPIs</span>
                  <span className="font-bold text-slate-900">{liveSummary.activeCount}</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600">KPIs completed</span>
                  <span className="font-bold text-slate-900">{liveSummary.completedCount} / {liveSummary.activeCount}</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600">KPIs on track</span>
                  <span className="font-bold text-slate-900">{liveSummary.onTrack} / {liveSummary.activeCount}</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600">Total weight</span>
                  <span className="font-bold text-slate-900">{liveSummary.weightTotal.toFixed(1)}%</span>
                </div>
                <div className="pt-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600">Weighted score</span>
                  <span className="text-xl font-extrabold text-[#262262]">{liveSummary.overallScore.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-3">Approval workflow</h3>
                <div className="divide-y divide-slate-100 text-xs">
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-600">1. Weekly employee updates</span>
                    <span className="font-bold text-slate-900">
                      {weeksNotedCount > 0 ? `${weeksNotedCount} / 5 weeks noted` : "Manual"}
                    </span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-600">2. Monthly employee submission</span>
                    <span className="font-bold text-slate-900">
                      {sheet.status === "DRAFT" ? "Pending" : SHEET_STATUS_LABEL[sheet.status]}
                    </span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-600">3. HOD review</span>
                    <span className="font-bold text-slate-900">
                      {sheet.status === "DRAFT"
                        ? "Awaiting submission"
                        : sheet.status === "SUBMITTED"
                        ? `Pending (${sheet.approver_name || "HOD"})`
                        : `Reviewed (${sheet.decided_by_name || sheet.approver_name || "HOD"})`}
                    </span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-600">4. HOD decision</span>
                    <span className="font-bold text-slate-900">
                      {sheet.status === "APPROVED"
                        ? "Approved & Locked"
                        : sheet.status === "RETURNED"
                        ? "Returned for correction"
                        : "Approve / Return"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-blue-50/70 border border-blue-100 px-3.5 py-2.5 text-[11px] text-blue-800 leading-relaxed">
                Persisted to TaskBoard database with HOD approval, return comments, role permissions, scorecard locking (at {thresholds.achievement_cap ?? 120}% cap) and audit history.
              </div>
            </div>
          </div>

          {/* Audit Trail */}
          {(sheet.history || []).length > 0 && (
            <Panel title="Monthly Scorecard Audit Trail" testid="mkpi-history">
              <ul className="divide-y divide-slate-100 text-xs">
                {[...(sheet.history || [])].reverse().map((h, idx) => (
                  <li key={idx} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={13} className="text-[#264494]" />
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${SHEET_CHIP[h.action] || "bg-slate-100 text-slate-700"}`}>{h.action}</span>
                      <span className="font-semibold text-slate-800">{h.by_name}</span>
                      {h.comment && <span className="text-slate-500">“{h.comment}”</span>}
                    </div>
                    <span className="text-slate-400">{new Date(h.at).toLocaleString("en-IN")}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}

      {weeklyModalKpi && sheet && (
        <WeeklyProgressModal
          sheet={sheet}
          kpi={weeklyModalKpi}
          canEdit={canEditActuals}
          onClose={() => setWeeklyModalKpi(null)}
        />
      )}

      {toggleAsk && (
        <ReasonDialog
          title={`Request to ${toggleAsk.desiredActive ? "Activate" : "Deactivate"} "${toggleAsk.kpi.kpi_name}"`}
          confirmText="Send Request to HOD"
          onCancel={() => setToggleAsk(null)}
          onConfirm={(r) => {
            setToggleAsk(null);
            sendToggleRequest(r);
          }}
        />
      )}

      {askDialog && (
        <ReasonDialog
          title={askDialog === "return" ? "Return Scorecard for Correction" : "Reopen Approved Scorecard"}
          confirmText={askDialog === "return" ? "Return to Employee" : "Reopen Scorecard"}
          onCancel={() => setAskDialog(null)}
          onConfirm={(comment) => {
            const act = askDialog;
            setAskDialog(null);
            decideSheet(act, comment);
          }}
        />
      )}
    </div>
  );
}
