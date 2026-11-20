import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Panel, Loading } from "@/components/dash/ui";
import ReasonDialog from "@/components/dash/ReasonDialog";
import ReportForm, { STATUS_CLS } from "@/components/daily/ReportForm";
import TeamReview from "@/components/daily/TeamReview";
import { todayKey } from "@/components/calendar/utils";
import { toast } from "sonner";

function History({ onPick, refresh }) {
  const [rows, setRows] = useState(null);
  const [corr, setCorr] = useState([]);
  useEffect(() => {
    api.get("/daily-reports/mine").then((r) => setRows(r.data));
    api.get("/daily-reports/corrections/mine").then((r) => setCorr(r.data));
  }, [refresh]);
  if (!rows) return <Loading />;
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Panel title="My reports (last 45 days)" className="lg:col-span-2" testid="my-history">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">{rows.map((r) => (
          <button key={r.date} onClick={() => onPick(r.date)} className="flex items-center justify-between rounded border border-slate-200 px-2.5 py-1.5 text-sm hover:bg-slate-50" data-testid={`history-${r.date}`}>
            <span>{r.date.slice(5)}</span><span className={`fe-chip ${STATUS_CLS[r.status]}`}>{r.status.replace("_", " ")}</span></button>))}</div>
      </Panel>
      <Panel title="My correction requests" testid="my-corrections">
        <ul className="text-sm divide-y divide-slate-100">{corr.map((c) => (
          <li key={c.id} className="py-2"><b>{c.date}</b> <span className={`fe-chip ${c.status === "APPROVED" ? "fe-chip-green" : c.status === "REJECTED" ? "fe-chip-red" : "fe-chip-blue"}`}>{c.status}</span>
            <div className="text-xs text-slate-500">{c.reason}{c.comment && ` — HOD: ${c.comment}`}</div></li>))}
          {!corr.length && <li className="text-slate-400">None</li>}</ul>
      </Panel>
    </div>
  );
}

function MyReport({ date, setDate, onChange }) {
  const [rep, setRep] = useState(null);
  const [ask, setAsk] = useState(false);
  useEffect(() => { setRep(null); api.get("/daily-reports/day", { params: { date } }).then((r) => setRep(r.data)).catch((e) => toast.error(errMsg(e))); }, [date]);
  const requestCorrection = async (reason) => {
    try { await api.post("/daily-reports/corrections", { date, reason }); toast.success("Correction request sent to your HOD"); onChange(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="fe-kpi-label">Report date</span>
        <input type="date" className="fe-input w-auto py-1.5" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} data-testid="my-date" />
        {date !== todayKey() && <button className="text-xs text-[#264494] hover:underline" onClick={() => setDate(todayKey())} data-testid="my-today">Back to today</button>}
        {rep && !rep.editable && rep.reviewer && date < todayKey() && <button className="fe-btn-secondary text-xs ml-auto" onClick={() => setAsk(true)} data-testid="request-correction">Request correction</button>}
      </div>
      {!rep ? <Loading /> : <ReportForm report={rep} onChanged={(r) => { setRep(r); onChange(); }} />}
      {ask && <ReasonDialog title="Reason for correction request" confirmText="Send to HOD" onCancel={() => setAsk(false)} onConfirm={(r) => { setAsk(false); requestCorrection(r); }} />}
    </div>
  );
}

export default function DailyActivity() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [date, setDate] = useState(todayKey());
  const [tick, setTick] = useState(0);
  const team = user.is_super_admin || (user.role_codes || []).includes("HEAD_OF_DEPARTMENT");
  const tabs = [{ id: "mine", label: "My daily report" }, { id: "history", label: "History & corrections" }, ...(team ? [{ id: "team", label: user.is_super_admin && !(user.role_codes || []).includes("HEAD_OF_DEPARTMENT") ? "Team monitoring" : "Team review" }] : [])];
  const tab = tabs.find((t) => t.id === params.get("tab"))?.id || "mine";
  return (
    <div className="space-y-5" data-testid="daily-activity-page">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold" style={{ color: "#262262" }}>Daily Activity</h1>
        <p className="text-sm text-slate-500 mt-1">Mandatory daily report (Mon–Sat, except the 2nd Saturday). Editable until 11:59:59 PM IST; locked at midnight. Changes after that need HOD-approved correction.</p>
      </div>
      <div className="flex gap-1 border-b border-slate-200" data-testid="daily-tabs">
        {tabs.map((t) => <button key={t.id} onClick={() => setParams({ tab: t.id })} data-testid={`daily-tab-${t.id}`}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tab === t.id ? "border-[#264494] text-[#264494]" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{t.label}</button>)}
      </div>
      {tab === "mine" && <MyReport date={date} setDate={setDate} onChange={() => setTick((x) => x + 1)} />}
      {tab === "history" && <History refresh={tick} onPick={(d) => { setDate(d); setParams({ tab: "mine" }); }} />}
      {tab === "team" && <TeamReview />}
    </div>
  );
}
