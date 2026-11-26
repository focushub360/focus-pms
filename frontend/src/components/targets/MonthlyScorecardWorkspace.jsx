import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errMsg, fmtVal, FY, hasAnyPerm } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Panel, Empty, Loading, Select, KpiCard } from "@/components/dash/ui";
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

const SHEET_CHIP = {
  DRAFT: "fe-chip-blue",
  SUBMITTED: "fe-chip-orange",
  APPROVED: "fe-chip-green",
  RETURNED: "fe-chip-red",
};

const KPI_STATUS_CHIP = {
  "On Track": "fe-chip-green",
  Watch: "fe-chip-orange",
  "At Risk": "fe-chip-red",
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

function WeeklyProgressModal({ sheet, kpi, canEdit, onClose, onLogged }) {
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
      onLogged();
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
              {sheet.user_name} · {sheet.month} · Target: {fmtVal(kpi.target, kpi.unit)} (Weekly tracking does not alter monthly percentage rules)
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

  // Draft values for inline editing
  const [actualDraft, setActualDraft] = useState({});
  const [remarksDraft, setRemarksDraft] = useState({});
  const [targetDraft, setTargetDraft] = useState({});
  const [weightDraft, setWeightDraft] = useState({});

  // Modals
  const [askDialog, setAskDialog] = useState(null); // "return" | "reopen"
  const [toggleAsk, setToggleAsk] = useState(null); // { kpi, desiredActive }
  const [weeklyModalKpi, setWeeklyModalKpi] = useState(null);

  const loadMeta = useCallback(() => {
    api.get("/monthly-kpis/templates").then((r) => setTemplates(r.data)).catch(() => {});
    api.get("/settings/kpi-thresholds").then((r) => setThresholds(r.data)).catch(() => {});
    api.get("/monthly-kpis/queue").then((r) => setQueue(r.data)).catch(() => setQueue([]));
    api.get("/monthly-kpis/toggle-requests").then((r) => setToggleReqs(r.data)).catch(() => setToggleReqs([]));
  }, []);

  const hydrateDrafts = (s) => {
    const ad = {}, rd = {}, td = {}, wg = {};
    for (const k of s.kpis || []) {
      ad[k.kpi_code] = k.actual ?? "";
      rd[k.kpi_code] = k.remarks ?? "";
      td[k.kpi_code] = k.target ?? "";
      wg[k.kpi_code] = k.weight ?? "";
    }
    setActualDraft(ad);
    setRemarksDraft(rd);
    setTargetDraft(td);
    setWeightDraft(wg);
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
    if (!sheet) return { weightTotal: 0, remainingWeight: 100, weightedScore: 0, overallScore: 0, onTrack: 0, watch: 0, atRisk: 0, pending: 0 };
    let weightTotal = 0;
    let weightedScore = 0;
    let onTrack = 0, watch = 0, atRisk = 0, pending = 0;
    for (const k of sheet.kpis || []) {
      const p = computeRowLive(k, actualDraft[k.kpi_code], targetDraft[k.kpi_code], weightDraft[k.kpi_code], thresholds);
      if (p.isActive) {
        weightTotal += p.weight;
        weightedScore += p.weightedScore || 0;
        if (p.status === "On Track") onTrack += 1;
        else if (p.status === "Watch") watch += 1;
        else if (p.status === "At Risk") atRisk += 1;
        else pending += 1;
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
      onTrack,
      watch,
      atRisk,
      pending,
    };
  }, [sheet, actualDraft, targetDraft, weightDraft, thresholds]);

  const saveMonthlyActuals = async () => {
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
            remarks: remarksDraft[k.kpi_code] ?? "",
          };
        });
      const r = await api.put("/monthly-kpis/actuals", { user_id: uid, month, entries });
      setSheet(r.data);
      hydrateDrafts(r.data);
      toast.success("Monthly KPI actuals saved");
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
      toast.success(nextTemplate ? "Role KPI template applied" : "KPI configuration updated");
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
    // Employee requesting toggle on a regular KPI -> HOD approval request
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
      await api.post(`/monthly-kpis/toggle-requests/${reqId}/decide`, { approve, comment: approve ? "Approved by HOD" : "Declined" });
      toast.success(approve ? "KPI toggle request approved" : "KPI toggle request rejected");
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
              remarks: remarksDraft[k.kpi_code] ?? "",
            };
          });
        await api.put("/monthly-kpis/actuals", { user_id: uid, month, entries });
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
        toast.error(detail.message || "Please fix the highlighted validation errors");
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
  const invalidFieldSet = useMemo(
    () => new Set(validationErrors.map((e) => `${e.kpi_code}:${e.field}`)),
    [validationErrors]
  );

  return (
    <div className="space-y-5" data-testid="monthly-kpi-workspace">
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

      {/* 6.1 Employee Selection & Metadata Header */}
      <div className="ios-card p-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          {canViewOthers && employees.length > 1 ? (
            <div>
              <div className="fe-kpi-label mb-1">Employee Name</div>
              <Select
                value={uid}
                onChange={setUid}
                testid="mkpi-employee-select"
                options={employees.map((e) => ({ value: e.id, label: e.name }))}
              />
            </div>
          ) : (
            <div>
              <div className="fe-kpi-label mb-1">Employee Name</div>
              <div className="fe-input py-1.5 text-sm bg-slate-50 font-semibold text-slate-800">{sheet?.user_name || user.name}</div>
            </div>
          )}

          <div>
            <div className="fe-kpi-label mb-1">Designation / Role</div>
            <div className="fe-input py-1.5 text-xs bg-slate-50 font-semibold text-[#262262] w-auto">
              {sheet?.designation || "Team Member"}
            </div>
          </div>

          <div>
            <div className="fe-kpi-label mb-1">Department</div>
            <div className="fe-input py-1.5 text-xs bg-slate-50 font-medium text-slate-700 w-auto">
              {sheet?.department || "Sales & Marketing"}
            </div>
          </div>

          <div>
            <div className="fe-kpi-label mb-1">Scorecard Month</div>
            <Select
              value={month}
              onChange={setMonth}
              testid="mkpi-month-select"
              options={FY_MONTHS.map((m) => ({ value: m, label: m }))}
            />
          </div>

          <div>
            <div className="fe-kpi-label mb-1">Reporting Year</div>
            <div className="fe-input py-1.5 text-xs bg-slate-50 font-semibold text-slate-700 w-auto">
              {sheet?.fy_code || FY}
            </div>
          </div>

          {sheet && canConfigTargets && templates.length > 0 && (
            <div>
              <div className="fe-kpi-label mb-1">Role KPI Template</div>
              <Select
                value={sheet.template_code}
                onChange={(tpl) => saveConfig(null, tpl)}
                testid="mkpi-template-select"
                options={templates.map((t) => ({ value: t.code, label: t.label }))}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isLocked && (
            <button onClick={syncCrm} disabled={busy} className="fe-btn-secondary !py-1.5 !px-3 !text-xs" data-testid="mkpi-sync-crm">
              <RefreshCw size={13} /> Sync CRM
            </button>
          )}
          {canEditActuals && (
            <button onClick={saveMonthlyActuals} disabled={busy} className="fe-btn-secondary !py-1.5 !px-3 !text-xs" data-testid="mkpi-save-actuals">
              <Save size={13} /> Save Monthly Actuals
            </button>
          )}
          {isSelf && !isLocked && (
            <button onClick={submitMonthly} disabled={busy} className="fe-btn-primary !py-1.5 !px-3.5 !text-xs" data-testid="mkpi-submit">
              <Send size={13} /> Submit Monthly Scorecard
            </button>
          )}
          {canApproveSelected && sheet?.status === "SUBMITTED" && (
            <>
              <button
                onClick={() => decideSheet("approve", "Approved")}
                disabled={busy}
                className="fe-btn-primary !py-1.5 !px-3 !text-xs"
                data-testid="mkpi-approve"
              >
                <ShieldCheck size={13} /> Approve &amp; Lock
              </button>
              <button
                onClick={() => setAskDialog("return")}
                disabled={busy}
                className="fe-btn-secondary !py-1.5 !px-3 !text-xs text-rose-600 border-rose-200"
                data-testid="mkpi-return"
              >
                <RotateCcw size={13} /> Return for Correction
              </button>
            </>
          )}
          {canApproveSelected && sheet?.status === "APPROVED" && (
            <button onClick={() => setAskDialog("reopen")} disabled={busy} className="fe-btn-secondary !py-1.5 !px-3 !text-xs" data-testid="mkpi-reopen">
              <RotateCcw size={13} /> Reopen
            </button>
          )}
        </div>
      </div>

      {/* Lock / Returned / Validation Banners */}
      {sheet?.status === "APPROVED" && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3 text-sm text-emerald-900" data-testid="mkpi-locked-banner">
          <Lock size={17} className="text-emerald-600 shrink-0" />
          <div>
            <b>Approved &amp; Locked</b> by {sheet.decided_by_name || sheet.approver_name}
            {sheet.decision_comment ? ` — “${sheet.decision_comment}”` : ""}. Historical records are preserved and locked from editing.
          </div>
        </div>
      )}
      {sheet?.status === "SUBMITTED" && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3 text-sm text-amber-900" data-testid="mkpi-submitted-banner">
          <Clock size={17} className="text-amber-600 shrink-0" />
          <div>
            <b>Submitted for HOD Approval</b> to {sheet.approver_name}. Editing is locked while under review.
          </div>
        </div>
      )}
      {sheet?.status === "RETURNED" && sheet.decision_comment && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 flex items-center gap-3 text-sm text-rose-900" data-testid="mkpi-returned-banner">
          <AlertTriangle size={17} className="text-rose-600 shrink-0" />
          <div>
            <b>Returned for Correction</b> by {sheet.decided_by_name || "HOD"}: “{sheet.decision_comment}”
          </div>
        </div>
      )}
      {validationErrors.length > 0 && (
        <div className="rounded-2xl bg-rose-50 border border-rose-300 px-4 py-3 text-xs text-rose-900 space-y-1" data-testid="mkpi-validation-errors">
          <div className="font-bold flex items-center gap-1.5 text-rose-700">
            <AlertTriangle size={14} /> Submission blocked — please correct the following fields:
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {validationErrors.map((ve, i) => (
              <li key={i}>{ve.message}</li>
            ))}
          </ul>
        </div>
      )}

      {err && <Panel><Empty text={err} /></Panel>}
      {loading && <Loading text="Loading monthly KPI scorecard…" />}

      {!loading && sheet && (
        <>
          {/* 6.3 Exact 4 Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5" data-testid="mkpi-summary-cards">
            <KpiCard
              label="Monthly Weighted Score"
              value={`${liveSummary.overallScore}%`}
              sub={`${liveSummary.weightedScore} pts · Max cap ${thresholds.achievement_cap ?? 120}%`}
              accent="#264494"
              testid="mkpi-overall-score"
            />
            <KpiCard
              label="Total Active KPI Weight"
              value={`${liveSummary.weightTotal}%`}
              sub={
                Math.abs(liveSummary.weightTotal - 100) < 0.01
                  ? "Valid allocation (100%)"
                  : liveSummary.remainingWeight > 0
                  ? `${liveSummary.remainingWeight}% remaining to allocate`
                  : `${Math.abs(liveSummary.remainingWeight)}% excess weight`
              }
              accent={Math.abs(liveSummary.weightTotal - 100) < 0.01 ? "#10B981" : "#EF4444"}
              testid="mkpi-weight-total"
            />
            <KpiCard
              label="KPIs On Track"
              value={`${liveSummary.onTrack} / ${liveSummary.onTrack + liveSummary.watch + liveSummary.atRisk + liveSummary.pending}`}
              sub={`Watch: ${liveSummary.watch} · At Risk: ${liveSummary.atRisk} · Pending: ${liveSummary.pending}`}
              accent="#10B981"
              testid="mkpi-on-track-card"
            />
            <div className="fe-kpi-card" data-testid="mkpi-submission-card">
              <span className="absolute top-0 left-0 right-0 h-[4px] rounded-t-2xl" style={{ background: "linear-gradient(90deg, #5856D6, #007AFF)" }} />
              <div className="fe-kpi-label">Monthly Submission Status</div>
              <div className="mt-2 flex items-center gap-2">
                <span className={`fe-chip text-xs px-3 py-1 ${SHEET_CHIP[sheet.status] || "fe-chip-blue"}`} data-testid="mkpi-status-badge">
                  {isLocked && <Lock size={11} className="mr-1" />}
                  {sheet.status}
                </span>
              </div>
              <div className="fe-kpi-sub">Approver: {sheet.approver_name || "HOD"}</div>
            </div>
          </div>

          {/* 6.2 Exact Scorecard Table (KPI, FREQ., SOURCE, TARGET, ACTUAL, ACH. %, WEIGHT, SCORE, STATUS, ACTIVE / DEACTIVE) */}
          <Panel
            title={`${sheet.user_name} · ${month} KPI Scorecard (${sheet.template_label})`}
            right={
              <div className="flex items-center gap-2">
                {canConfigTargets && (
                  <button onClick={() => saveConfig()} disabled={busy} className="fe-btn-secondary !py-1.5 !px-3 !text-xs" data-testid="mkpi-save-config">
                    Save Targets &amp; Weights
                  </button>
                )}
                <span className="text-[11px] text-slate-500 hidden md:inline">
                  On Track ≥ {thresholds.achieved}% · Watch ≥ {thresholds.on_track}% · Cap {thresholds.achievement_cap ?? 120}%
                </span>
              </div>
            }
            testid="mkpi-table-panel"
          >
            <div className="overflow-x-auto">
              <table className="fe-table" data-testid="mkpi-table">
                <thead>
                  <tr>
                    <th>KPI</th>
                    <th>Freq.</th>
                    <th>Source</th>
                    <th className="text-right">Target</th>
                    <th className="text-right">Actual</th>
                    <th className="text-right">Ach. %</th>
                    <th className="text-right">Weight</th>
                    <th className="text-right">Score</th>
                    <th>Status</th>
                    <th className="text-center">Active / Deactive</th>
                  </tr>
                </thead>
                <tbody>
                  {(sheet.kpis || []).map((k) => {
                    const p = computeRowLive(k, actualDraft[k.kpi_code], targetDraft[k.kpi_code], weightDraft[k.kpi_code], thresholds);
                    const isCapped = p.rawAch !== null && p.rawAch > p.capPct;
                    const badTarget = invalidFieldSet.has(`${k.kpi_code}:target`);
                    const badActual = invalidFieldSet.has(`${k.kpi_code}:actual`);

                    return (
                      <tr
                        key={k.kpi_code}
                        className={!k.is_active ? "opacity-60 bg-slate-50/80" : ""}
                        data-testid={`mkpi-row-${k.kpi_code}`}
                      >
                        <td className="min-w-[230px]">
                          <div className="font-semibold text-slate-800">{k.kpi_name}</div>
                          {k.measurement && <div className="text-[11px] text-slate-400">{k.measurement}</div>}
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            <span className={`fe-chip ${k.is_optional ? "fe-chip-orange" : "fe-chip-blue"}`}>
                              {k.is_optional ? "Optional" : "Regular"}
                            </span>
                            <span className={`fe-chip ${k.kpi_group === "Sales & BD" ? "fe-chip-purple" : "fe-chip-cyan"}`}>
                              {k.kpi_group || "Functional"}
                            </span>
                            {k.is_active && (
                              <button
                                type="button"
                                onClick={() => setWeeklyModalKpi(k)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-[#264494] hover:underline ml-1"
                                data-testid={`mkpi-weekly-btn-${k.kpi_code}`}
                              >
                                <CalendarPlus size={11} /> Weekly Progress
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="text-xs whitespace-nowrap">{k.frequency}</td>
                        <td className="text-xs whitespace-nowrap text-slate-600">{k.source || k.data_source}</td>

                        <td className="text-right">
                          {canConfigTargets && k.is_active ? (
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={targetDraft[k.kpi_code] ?? ""}
                              onChange={(e) => setTargetDraft({ ...targetDraft, [k.kpi_code]: e.target.value })}
                              className={`fe-input !py-1 !px-2 w-24 text-right text-xs ${badTarget ? "!border-rose-500 !ring-2 !ring-rose-200" : ""}`}
                              data-testid={`mkpi-target-${k.kpi_code}`}
                            />
                          ) : (
                            <span className="text-xs font-medium">{fmtVal(p.target, k.unit)}</span>
                          )}
                        </td>

                        <td className="text-right">
                          {canEditActuals && k.is_active ? (
                            <div className="flex flex-col items-end gap-1">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={actualDraft[k.kpi_code] ?? ""}
                                placeholder="Enter actual"
                                onChange={(e) => setActualDraft({ ...actualDraft, [k.kpi_code]: e.target.value })}
                                className={`fe-input !py-1 !px-2 w-24 text-right text-xs ${badActual ? "!border-rose-500 !ring-2 !ring-rose-200" : ""}`}
                                data-testid={`mkpi-actual-${k.kpi_code}`}
                              />
                              <span className="text-[10px] text-slate-400">{k.unit}</span>
                            </div>
                          ) : (
                            <span className="text-xs font-semibold">{fmtVal(p.actual, k.unit)}</span>
                          )}
                        </td>

                        <td className="text-right whitespace-nowrap text-xs">
                          {!k.is_active || p.rawAch === null ? "—" : (
                            <div>
                              <span className="font-semibold">{p.rawAch}%</span>
                              {isCapped && <div className="text-[10px] font-bold text-amber-600">capped {p.capPct}%</div>}
                            </div>
                          )}
                        </td>

                        <td className="text-right">
                          {canConfigTargets && k.is_active ? (
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={weightDraft[k.kpi_code] ?? ""}
                              onChange={(e) => setWeightDraft({ ...weightDraft, [k.kpi_code]: e.target.value })}
                              className="fe-input !py-1 !px-2 w-16 text-right text-xs"
                              data-testid={`mkpi-weight-${k.kpi_code}`}
                            />
                          ) : (
                            <span className="text-xs font-semibold">{p.weight}%</span>
                          )}
                        </td>

                        <td className="text-right whitespace-nowrap text-xs">
                          {!k.is_active || p.weightedScore === null ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span className="font-bold text-[#262262]">{p.weightedScore}</span>
                          )}
                        </td>

                        <td>
                          <span className={`fe-chip ${KPI_STATUS_CHIP[p.status] || "fe-chip-blue"}`} data-testid={`mkpi-row-status-${k.kpi_code}`}>
                            {p.status}
                          </span>
                        </td>

                        {/* Final column AFTER Status: Active / Deactive toggle */}
                        <td className="text-center">
                          <button
                            type="button"
                            disabled={isLocked || busy}
                            onClick={() => handleToggleActive(k)}
                            data-testid={`mkpi-toggle-${k.kpi_code}`}
                            title={
                              isLocked
                                ? "Scorecard locked"
                                : k.is_active
                                ? "Click to deactivate (excluded from calculations, history retained)"
                                : "Click to activate KPI"
                            }
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                              k.is_active ? "bg-[#264494]" : "bg-slate-300"
                            }`}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                                k.is_active ? "translate-x-4" : "translate-x-1"
                              }`}
                            />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* 12. Audit Trail */}
          {(sheet.history || []).length > 0 && (
            <Panel title="Monthly Scorecard Audit Trail" testid="mkpi-history">
              <ul className="divide-y divide-slate-100 text-sm">
                {[...(sheet.history || [])].reverse().map((h, idx) => (
                  <li key={idx} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-[#264494]" />
                      <span className={`fe-chip ${SHEET_CHIP[h.action] || "fe-chip-blue"}`}>{h.action}</span>
                      <span className="font-medium text-slate-800">{h.by_name}</span>
                      {h.comment && <span className="text-slate-500 text-xs">“{h.comment}”</span>}
                    </div>
                    <span className="text-xs text-slate-400">{new Date(h.at).toLocaleString("en-IN")}</span>
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
          onLogged={() => {}}
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
