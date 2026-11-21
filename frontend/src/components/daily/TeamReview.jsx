import { useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { Panel, Loading, Empty } from "@/components/dash/ui";
import ReasonDialog from "@/components/dash/ReasonDialog";
import ReportForm, { STATUS_CLS } from "@/components/daily/ReportForm";
import { todayKey } from "@/components/calendar/utils";
import { toast } from "sonner";

function Corrections({ list, canReview, onDone }) {
  const [ask, setAsk] = useState(null);
  const act = async (c, ok, comment = "") => {
    try { await api.post(`/daily-reports/corrections/${c.id}/${ok ? "approve" : "reject"}`, { comment }); toast.success(ok ? "Correction approved — 24 h edit window opened" : "Correction rejected"); onDone(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  if (!list.length) return null;
  return (
    <Panel title={`Correction requests (${list.length})`} testid="correction-queue">
      <ul className="divide-y divide-slate-100 text-sm">{list.map((c) => (
        <li key={c.id} className="py-2 flex flex-wrap items-center gap-3" data-testid={`correction-${c.id}`}>
          <b>{c.user_name}</b><span>{c.date}</span><span className="text-slate-500">“{c.reason}”</span>
          {canReview && <span className="ml-auto flex gap-2"><button className="fe-btn-primary text-xs py-1" onClick={() => act(c, true)} data-testid={`correction-approve-${c.id}`}>Approve</button>
            <button className="fe-btn-secondary text-xs py-1" onClick={() => setAsk(c)} data-testid={`correction-reject-${c.id}`}>Reject</button></span>}
        </li>))}</ul>
      {ask && <ReasonDialog title="Reason for rejecting correction" onCancel={() => setAsk(null)} onConfirm={(r) => { const c = ask; setAsk(null); act(c, false, r); }} />}
    </Panel>
  );
}

function Review({ report, onDone }) {
  const [ask, setAsk] = useState(false);
  const act = async (kind, comment = "") => {
    try { await api.post(`/daily-reports/${report.id}/${kind}`, { comment }); toast.success(kind === "approve" ? "Report approved" : "Report returned for correction"); onDone(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  if (!report.can_review || report.status !== "SUBMITTED") return null;
  return (<>
    <button className="fe-btn-secondary" onClick={() => setAsk(true)} data-testid="review-return">Return for correction</button>
    <button className="fe-btn-primary" onClick={() => act("approve")} data-testid="review-approve">Approve report</button>
    {ask && <ReasonDialog title="Reason for returning" onCancel={() => setAsk(false)} onConfirm={(r) => { setAsk(false); act("return", r); }} />}
  </>);
}

export default function TeamReview() {
  const [date, setDate] = useState(todayKey());
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const load = () => api.get("/daily-reports/team", { params: { date } }).then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { setOpen(null); load(); }, [date]); // eslint-disable-line
  const openReport = (uid) => api.get("/daily-reports/day", { params: { date, user_id: uid } }).then((r) => setOpen(r.data)).catch((e) => toast.error(errMsg(e)));
  if (!data) return <Loading />;
  const counts = data.rows.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  return (
    <div className="space-y-4" data-testid="team-review">
      <div className="flex flex-wrap items-center gap-3">
        <span className="fe-kpi-label">Date</span><input type="date" className="fe-input w-auto py-1.5" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} data-testid="team-date" />
        {!data.working_day && <span className="fe-chip fe-chip-purple">Not a mandatory working day</span>}
        {!data.can_review && <span className="fe-chip fe-chip-cyan" data-testid="monitor-only">Monitoring only — approvals are done by the HOD</span>}
        <span className="text-sm text-slate-500 ml-auto">{Object.entries(counts).map(([k, v]) => `${k.replace("_", " ").toLowerCase()}: ${v}`).join(" · ")}</span>
      </div>
      <Corrections list={data.pending_corrections} canReview={data.can_review} onDone={load} />
      <Panel title="Team daily reports">
        {data.rows.length ? <table className="fe-table" data-testid="team-table"><thead><tr><th>Employee</th><th>Designation</th><th>Status</th><th>Submitted</th><th /></tr></thead>
          <tbody>{data.rows.map((r) => (
            <tr key={r.id} data-testid={`team-row-${r.id}`}><td className="font-medium">{r.name}</td><td className="text-slate-500">{r.designation}</td>
              <td><span className={`fe-chip ${STATUS_CLS[r.status]}`}>{r.status}</span>{r.corrected && <span className="fe-chip fe-chip-purple ml-1">Corrected</span>}</td>
              <td className="text-xs text-slate-500">{r.submitted_at ? new Date(r.submitted_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</td>
              <td>{r.report_id && <button className="text-xs text-[#264494] hover:underline" onClick={() => openReport(r.id)} data-testid={`team-open-${r.id}`}>Open</button>}</td></tr>))}</tbody></table>
          : <Empty text="No employees" />}
      </Panel>
      {open && <ReportForm report={open} onChanged={() => {}} reviewSlot={<Review report={open} onDone={() => { load(); openReport(open.user_id); }} />} />}
    </div>
  );
}
