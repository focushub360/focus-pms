import { useEffect, useState } from "react";
import { api, errMsg, FY, hasPerm } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Panel, Empty, Loading, Select, KpiCard } from "@/components/dash/ui";
import { KpiAchievementChart, ScorecardTable } from "@/components/dash/Scorecard";
import ActualDialog from "@/components/dash/ActualDialog";
import MonthlyScorecard, { ApprovalQueue } from "@/components/targets/MonthlyScorecard";
import { toast } from "sonner";

export default function ScorecardTab({ employees }) {
  const { user } = useAuth();
  const [uid, setUid] = useState(user.id);
  const [sc, setSc] = useState(null);
  const [err, setErr] = useState("");
  const [item, setItem] = useState(null);
  const canValidate = hasPerm(user, "KPI_ACTUAL_VALIDATE");

  const load = () => { setSc(null); setErr(""); api.get(`/kpi/scorecard/${uid}`, { params: { fy_code: FY } }).then((r) => setSc(r.data)).catch((e) => setErr(errMsg(e))); };
  useEffect(load, [uid]);

  const validate = async (i) => {
    try { await api.post(`/kpi/assignments/${i.assignment_id}/validate`); toast.success("Actual validated"); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  const canEnter = uid === user.id;
  const pendingValidation = sc?.items.filter((i) => i.actual_status === "SUBMITTED") || [];
  const counts = (sc?.items || []).reduce((a, i) => ((a[i.status] = (a[i.status] || 0) + 1), a), {});

  return (
    <div className="space-y-5" data-testid="scorecard-tab">
      {employees.length > 1 && (
        <div className="flex items-center gap-2"><span className="fe-kpi-label">Employee</span>
          <Select value={uid} onChange={setUid} testid="scorecard-employee" options={employees.map((e) => ({ value: e.id, label: e.name }))} /></div>
      )}
      {err && <Panel><Empty text={err} /></Panel>}
      {!sc && !err && <Loading />}
      {sc && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <KpiCard label="Weighted score" value={sc.overall_score === null ? "—" : `${sc.overall_score}%`} sub={sc.total_weightage ? `Weightage ${sc.total_weightage}` : "Awaiting targets / actuals"} testid="sc-overall" />
            <KpiCard label="Assigned KPIs" value={sc.items.length} accent="#262262" />
            <KpiCard label="Achieved" value={counts.ACHIEVED || 0} accent="#10B981" />
            <KpiCard label="On track" value={counts.ON_TRACK || 0} accent="#51C5DC" />
            <KpiCard label="At risk" value={counts.AT_RISK || 0} accent="#F19A2F" />
            <KpiCard label="Below target" value={counts.BELOW_TARGET || 0} accent="#EF4444" />
            <KpiCard label="Target pending" value={(counts.TARGET_PENDING || 0) + (counts.NOT_UPDATED || 0)} accent="#94A3B8" sub="Awaiting target / data" />
          </div>
          <div className="text-xs text-slate-500">Thresholds: Achieved ≥ {sc.thresholds.achieved}% · On track ≥ {sc.thresholds.on_track}% · At risk ≥ {sc.thresholds.at_risk}% · otherwise Below target</div>
          {canValidate && pendingValidation.length > 0 && uid !== user.id && (
            <Panel title={`Actuals awaiting validation (${pendingValidation.length})`} testid="pending-validation">
              <ul className="divide-y divide-slate-100 text-sm">{pendingValidation.map((i) => (
                <li key={i.assignment_id} className="py-2 flex justify-between items-center"><span>{i.kpi_name}: <b>{i.actual}</b> {i.unit}</span>
                  <button className="fe-btn-primary text-xs py-1" onClick={() => validate(i)} data-testid={`validate-${i.kpi_code}`}>Validate</button></li>))}</ul>
            </Panel>
          )}
          <ApprovalQueue />
          <MonthlyScorecard uid={uid} />
          <div className="text-xs text-slate-500" data-testid="core-note">Weighted score uses the 7 core KPIs only; other assigned KPIs are optional and shown for tracking.</div>
          <Panel title="KPI Achievement Chart"><KpiAchievementChart items={sc.items} /></Panel>
          <Panel title="KPI Scorecard"><ScorecardTable items={sc.items} canEnter={canEnter} onEnterActual={setItem} /></Panel>
        </>
      )}
      {item && <ActualDialog item={item} onClose={() => setItem(null)} onSaved={() => { setItem(null); load(); }} />}
    </div>
  );
}
