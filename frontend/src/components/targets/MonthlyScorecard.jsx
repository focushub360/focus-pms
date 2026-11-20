import { useEffect, useState } from "react";
import { api, errMsg, FY } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Panel, Empty, Select } from "@/components/dash/ui";
import ReasonDialog from "@/components/dash/ReasonDialog";
import { toast } from "sonner";

const CHIP = { SUBMITTED: "fe-chip-blue", APPROVED: "fe-chip-green", REJECTED: "fe-chip-red", REOPENED: "fe-chip-orange" };
const now = new Date().toISOString().slice(0, 7);
const MONTHS = Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(Number(FY.slice(2, 6)), 3 + i, 1)); return d.toISOString().slice(0, 7); }).filter((m) => m <= now);

function Actions({ sc, onDone }) {
  const [ask, setAsk] = useState(null);
  const act = async (kind, comment = "") => {
    try { await api.post(`/scorecards/monthly/${sc.id}/${kind}`, { comment }); toast.success(`Scorecard ${kind === "approve" ? "approved" : kind === "reject" ? "rejected" : "reopened"}`); onDone(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <span className="flex gap-2">
      {sc.status === "SUBMITTED" && <>
        <button className="fe-btn-primary text-xs py-1" onClick={() => act("approve")} data-testid={`sc-approve-${sc.id}`}>Approve</button>
        <button className="fe-btn-secondary text-xs py-1" onClick={() => setAsk("reject")} data-testid={`sc-reject-${sc.id}`}>Reject</button></>}
      {sc.status === "APPROVED" && <button className="fe-btn-secondary text-xs py-1" onClick={() => setAsk("reopen")} data-testid={`sc-reopen-${sc.id}`}>Reopen</button>}
      {ask && <ReasonDialog title={ask === "reject" ? "Reason for rejection" : "Reason for reopening"} confirmText="Confirm"
        onCancel={() => setAsk(null)} onConfirm={(r) => { const k = ask; setAsk(null); act(k, r); }} />}
    </span>
  );
}

function Row({ sc, mine, onDone }) {
  return (
    <li className="py-2.5 flex flex-wrap items-center gap-3 text-sm" data-testid={`monthly-row-${sc.month}`}>
      <b className="w-20">{sc.month}</b>
      {sc.user_name && <span className="text-slate-600">{sc.user_name}</span>}
      <span className={`fe-chip ${CHIP[sc.status]}`} data-testid={`monthly-status-${sc.month}`}>{sc.status}</span>
      <span className="text-slate-500">Score {sc.overall_score ?? "—"}{sc.overall_score != null && "%"} · Approver {sc.approver_name}</span>
      {sc.decision_comment && <span className="text-xs text-slate-400">“{sc.decision_comment}”</span>}
      {mine && <span className="ml-auto"><Actions sc={sc} onDone={onDone} /></span>}
    </li>
  );
}

export function ApprovalQueue() {
  const [q, setQ] = useState([]);
  const load = () => api.get("/scorecards/monthly/queue").then((r) => setQ(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!q.length) return null;
  return (
    <Panel title={`Monthly scorecards awaiting your approval (${q.length})`} testid="approval-queue">
      <ul className="divide-y divide-slate-100">{q.map((s) => <Row key={s.id} sc={s} mine onDone={load} />)}</ul>
    </Panel>
  );
}

export default function MonthlyScorecard({ uid }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [month, setMonth] = useState(MONTHS[MONTHS.length - 1]);
  const load = () => api.get("/scorecards/monthly", { params: { user_id: uid } }).then((r) => setData(r.data)).catch(() => setData({ items: [] }));
  useEffect(() => { load(); }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => {
    try { await api.post("/scorecards/monthly/submit", { month }); toast.success(`Scorecard for ${month} submitted`); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  if (!data) return null;
  return (
    <Panel title="Monthly scorecard submission" testid="monthly-scorecard">
      <div className="flex flex-wrap items-center gap-3 text-sm mb-3">
        <span className="text-slate-500" data-testid="monthly-approver">Approver: <b className="text-slate-800">{data.approver?.name || "Not configured"}</b></span>
        {uid === user.id && <>
          <Select value={month} onChange={setMonth} testid="monthly-month" options={MONTHS.map((m) => ({ value: m, label: m }))} />
          <button className="fe-btn-primary text-xs" onClick={submit} data-testid="monthly-submit">Submit for approval</button></>}
      </div>
      {data.items.length ? <ul className="divide-y divide-slate-100">{data.items.map((s) => <Row key={s.id} sc={s} mine={s.approver_id === user.id} onDone={load} />)}</ul>
        : <Empty text="No monthly scorecards submitted yet." />}
    </Panel>
  );
}
