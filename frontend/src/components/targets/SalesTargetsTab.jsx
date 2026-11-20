import { useEffect, useMemo, useState } from "react";
import { api, errMsg, fmtINR, FY, hasPerm, monthLabel } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Panel, Empty, Loading } from "@/components/dash/ui";
import ReasonDialog from "@/components/dash/ReasonDialog";
import { toast } from "sonner";

const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"];
const DEPT = "DEPARTMENT";

function ReviseDialog({ subject, current, onClose, onSaved }) {
  const [annual, setAnnual] = useState(current?.sales_target_inr ?? "");
  const [monthly, setMonthly] = useState(current?.monthly_targets || {});
  const [useMonthly, setUseMonthly] = useState(Object.keys(current?.monthly_targets || {}).length > 0);
  const [eff, setEff] = useState(current?.effective_date || "2026-04-01");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const msum = MONTHS.reduce((s, m) => s + Number(monthly[m] || 0), 0);
  const quarters = [0, 1, 2, 3].map((q) => MONTHS.slice(q * 3, q * 3 + 3).reduce((s, m) => s + Number(monthly[m] || 0), 0));

  const submit = async (e) => {
    e.preventDefault();
    const total = useMonthly ? msum : Number(annual);
    if (!total || total <= 0) return toast.error("Enter a target greater than zero");
    if (reason.trim().length < 3) return toast.error("A revision reason is required");
    setBusy(true);
    try {
      const mt = useMonthly ? Object.fromEntries(MONTHS.filter((m) => Number(monthly[m])).map((m) => [m, Number(monthly[m])])) : {};
      await api.post("/targets/revisions", { user_id: subject.id, fy_code: FY, sales_target_inr: total, monthly_targets: mt, effective_date: eff, reason });
      toast.success("Target submitted for approval");
      onSaved();
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-start justify-center p-4 overflow-y-auto" data-testid="revise-target-dialog">
      <form onSubmit={submit} className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8 p-6 border border-slate-200">
        <h3 className="text-lg font-bold text-[#262262]">Revise sales target · {subject.name}</h3>
        <p className="text-xs text-slate-500 mt-1">Current approved: <b>{fmtINR(current?.sales_target_inr ?? null)}</b>. The new value applies only after approval. Targets are never auto-distributed.</p>
        <label className="flex items-center gap-2 text-sm mt-4"><input type="checkbox" checked={useMonthly} onChange={(e) => setUseMonthly(e.target.checked)} data-testid="use-monthly" /> Define month-wise targets (annual = sum of months)</label>
        {!useMonthly ? (
          <div className="mt-3"><label className="fe-kpi-label">Annual target (INR)</label>
            <input type="number" min="0" step="1000" value={annual} onChange={(e) => setAnnual(e.target.value)} className="fe-input mt-1" data-testid="annual-target-input" />
            <div className="text-xs text-slate-500 mt-1">{fmtINR(Number(annual || 0))}</div></div>
        ) : (
          <div className="mt-3">
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2">{MONTHS.map((m) => (
              <div key={m}><label className="text-[11px] text-slate-500">{monthLabel(m)} {m.slice(2, 4)}</label>
                <input type="number" min="0" value={monthly[m] ?? ""} onChange={(e) => setMonthly({ ...monthly, [m]: e.target.value })} className="fe-input py-1 text-sm" data-testid={`month-${m}`} /></div>))}</div>
            <div className="grid grid-cols-5 gap-2 mt-3 text-xs bg-slate-50 rounded-md p-2">
              {quarters.map((q, i) => <div key={i}>Q{i + 1}: <b>{fmtINR(q)}</b></div>)}<div>Annual: <b>{fmtINR(msum)}</b></div>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <div><label className="fe-kpi-label">Effective date</label><input type="date" value={eff} onChange={(e) => setEff(e.target.value)} className="fe-input mt-1" /></div>
          <div><label className="fe-kpi-label">Revision reason *</label><input value={reason} onChange={(e) => setReason(e.target.value)} className="fe-input mt-1" placeholder="e.g. Based on account potential & pipeline" data-testid="revision-reason" /></div>
        </div>
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="fe-btn-secondary">Cancel</button>
          <button className="fe-btn-primary" disabled={busy} data-testid="submit-revision">{busy ? "Submitting…" : "Submit for approval"}</button></div>
      </form>
    </div>
  );
}

export default function SalesTargetsTab({ employees }) {
  const { user } = useAuth();
  const canConfig = hasPerm(user, "TARGETS_CONFIGURE");
  const canApprove = hasPerm(user, "TARGETS_APPROVE");
  const [targets, setTargets] = useState(null);
  const [revs, setRevs] = useState([]);
  const [revise, setRevise] = useState(null);
  const [rejecting, setRejecting] = useState(null);

  const load = async () => {
    try {
      const [t, r] = await Promise.all([api.get("/targets", { params: { fy_code: FY } }), api.get("/targets/revisions", { params: { fy_code: FY } })]);
      setTargets(t.data); setRevs(r.data);
    } catch (e) { toast.error(errMsg(e)); setTargets([]); }
  };
  useEffect(() => { load(); }, []);
  const byUser = useMemo(() => Object.fromEntries((targets || []).map((t) => [t.user_id, t])), [targets]);
  const pendingFor = (id) => revs.find((r) => r.user_id === id && r.status === "PENDING");
  const nameOf = (id) => (id === DEPT ? "Department" : employees.find((e) => e.id === id)?.name || "—");

  const decide = async (r, approve, comment = "") => {
    if (!approve && !comment) return setRejecting(r);
    try { await api.post(`/targets/revisions/${r.id}/${approve ? "approve" : "reject"}`, { comment }); toast.success(approve ? "Target approved" : "Revision rejected"); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };

  if (!targets) return <Loading />;
  const indivSum = employees.reduce((s, e) => s + Number(byUser[e.id]?.sales_target_inr || 0), 0);
  const dept = byUser[DEPT];
  const pending = revs.filter((r) => r.status === "PENDING");
  const visibleEmployees = employees.filter((e) => canConfig || canApprove || e.id === user.id || byUser[e.id]);

  return (
    <div className="space-y-6" data-testid="sales-targets-tab">
      <Panel title="Department Sales Target · FY 2026–27" testid="dept-target-panel"
        right={canConfig && <button className="fe-btn-primary text-xs" onClick={() => setRevise({ id: DEPT, name: "Department" })} disabled={!!pendingFor(DEPT)} data-testid="revise-dept-target">Set / revise</button>}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div><div className="fe-kpi-label">Approved department target</div><div className="text-xl font-bold text-[#262262]" data-testid="dept-target-value">{fmtINR(dept?.sales_target_inr ?? null)}</div></div>
          <div><div className="fe-kpi-label">Sum of individual targets</div><div className="text-xl font-bold text-[#264494]">{fmtINR(indivSum || null)}</div></div>
          <div><div className="fe-kpi-label">Gap</div><div className="text-xl font-bold text-[#F19A2F]">{dept && indivSum ? fmtINR(dept.sales_target_inr - indivSum) : "—"}</div>
            {pendingFor(DEPT) && <span className="fe-chip fe-chip-orange mt-1">Revision pending</span>}</div>
        </div>
      </Panel>

      {(canApprove || canConfig) && (
        <Panel title={`Pending Approvals (${pending.length})`} testid="pending-revisions">
          {pending.length ? <table className="fe-table"><thead><tr><th>For</th><th className="text-right">Current</th><th className="text-right">Proposed</th><th>Reason</th><th>Submitted by</th><th></th></tr></thead>
            <tbody>{pending.map((r) => (
              <tr key={r.id} data-testid={`pending-${r.user_id}`}><td className="font-semibold">{nameOf(r.user_id)}</td><td className="text-right">{fmtINR(r.previous?.sales_target_inr ?? null)}</td>
                <td className="text-right font-semibold text-[#264494]">{fmtINR(r.sales_target_inr)}</td><td className="text-xs">{r.reason}</td><td className="text-xs">{r.submitted_by_name}<div className="text-slate-400">{new Date(r.submitted_at).toLocaleDateString("en-IN")}</div></td>
                <td className="whitespace-nowrap">{canApprove && r.user_id !== user.id ? <>
                  <button className="fe-btn-primary text-xs py-1 mr-2" onClick={() => decide(r, true)} data-testid={`approve-${r.user_id}`}>Approve</button>
                  <button className="fe-btn-secondary text-xs py-1" onClick={() => decide(r, false)} data-testid={`reject-${r.user_id}`}>Reject</button></> : <span className="text-xs text-slate-400">{r.user_id === user.id ? "Needs another approver" : "Awaiting approver"}</span>}</td></tr>))}</tbody></table>
            : <Empty text="No pending target revisions." />}
        </Panel>
      )}

      <Panel title="Individual Sales Targets" testid="individual-targets">
        <div className="overflow-x-auto"><table className="fe-table" data-testid="individual-targets-table">
          <thead><tr><th>Employee</th><th>Functional responsibility</th><th className="text-right">Approved target</th><th>Monthly split</th><th>Effective</th><th>Status</th>{canConfig && <th></th>}</tr></thead>
          <tbody>{visibleEmployees.map((e) => {
            const t = byUser[e.id], p = pendingFor(e.id);
            return (
              <tr key={e.id} data-testid={`target-row-${e.id}`}><td className="font-semibold text-slate-800">{e.name}</td><td className="text-xs">{e.designation}</td>
                <td className="text-right font-semibold">{fmtINR(t?.sales_target_inr ?? null)}</td>
                <td className="text-xs">{t?.monthly_targets && Object.keys(t.monthly_targets).length ? `${Object.keys(t.monthly_targets).length} months` : "Annual only"}</td>
                <td className="text-xs">{t?.effective_date || "—"}</td>
                <td>{p ? <span className="fe-chip fe-chip-orange">Pending {fmtINR(p.sales_target_inr)}</span> : t ? <span className="fe-chip fe-chip-green">Approved</span> : <span className="fe-chip fe-chip-blue">Not set</span>}</td>
                {canConfig && <td><button className="text-xs text-[#264494] hover:underline disabled:text-slate-300" disabled={!!p} onClick={() => setRevise(e)} data-testid={`revise-${e.id}`}>{t ? "Revise" : "Set target"}</button></td>}
              </tr>);
          })}</tbody></table></div>
      </Panel>

      <Panel title="Target Revision History" testid="revision-history">
        {revs.length ? <table className="fe-table"><thead><tr><th>Date</th><th>For</th><th className="text-right">Previous</th><th className="text-right">Proposed</th><th>Reason</th><th>Status</th><th>Decided by</th></tr></thead>
          <tbody>{revs.map((r) => <tr key={r.id}><td className="text-xs">{new Date(r.submitted_at).toLocaleDateString("en-IN")}</td><td>{nameOf(r.user_id)}</td><td className="text-right">{fmtINR(r.previous?.sales_target_inr ?? null)}</td><td className="text-right">{fmtINR(r.sales_target_inr)}</td><td className="text-xs">{r.reason}{r.decision_comment ? <div className="text-slate-400">↳ {r.decision_comment}</div> : null}</td>
            <td><span className={`fe-chip ${r.status === "APPROVED" ? "fe-chip-green" : r.status === "REJECTED" ? "fe-chip-red" : "fe-chip-orange"}`}>{r.status}</span></td><td className="text-xs">{r.decided_by_name || "—"}</td></tr>)}</tbody></table>
          : <Empty text="No revisions yet." />}
      </Panel>

      {revise && <ReviseDialog subject={revise} current={byUser[revise.id]} onClose={() => setRevise(null)} onSaved={() => { setRevise(null); load(); }} />}
      {rejecting && <ReasonDialog title={`Reject target revision · ${nameOf(rejecting.user_id)}`} label="Reason for rejection" confirmText="Reject"
        onCancel={() => setRejecting(null)} onConfirm={(c) => { const r = rejecting; setRejecting(null); decide(r, false, c); }} />}
    </div>
  );
}
