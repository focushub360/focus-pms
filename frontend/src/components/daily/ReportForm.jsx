import { useEffect, useState } from "react";
import { Paperclip, Plus, Trash2 } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { Panel } from "@/components/dash/ui";
import { toast } from "sonner";

const CATS = ["Sales Call", "Customer Meeting", "Follow-up", "Proposal", "Lead Generation", "Marketing", "Project / Operations", "Internal Meeting", "Admin", "Other"];
const SYS = [["sales_calls", "Sales calls"], ["customer_meetings", "Customer meetings"], ["follow_ups", "Follow-ups"], ["tasks_completed", "Tasks completed"],
  ["leads_created", "Leads created"], ["opportunities_created", "Opportunities created"], ["proposals_submitted", "Proposals submitted"]];
const MAN = [["site_visits", "Site visits"], ["emails_sent", "Emails sent"], ["other_activities", "Other activities"]];
export const STATUS_CLS = { APPROVED: "fe-chip-green", SUBMITTED: "fe-chip-blue", DRAFT: "fe-chip-orange", RETURNED: "fe-chip-red", MISSING: "fe-chip-red", NOT_STARTED: "fe-chip-purple" };

function useCrm() {
  const [o, setO] = useState([]);
  useEffect(() => {
    const g = (u, t, f) => api.get(u).then((r) => r.data.map((x) => ({ value: `${t}:${x.id}`, label: `${t} · ${f(x)}` }))).catch(() => []);
    Promise.all([g("/leads", "lead", (x) => x.name), g("/accounts", "account", (x) => x.name), g("/opportunities", "opportunity", (x) => x.title)]).then((a) => setO(a.flat()));
  }, []);
  return o;
}

function EntryRow({ e, i, ro, crm, upd, del }) {
  return (
    <tr data-testid={`entry-row-${i}`}>
      <td><textarea rows={1} disabled={ro} className="fe-input py-1 text-sm" value={e.description} onChange={(x) => upd({ description: x.target.value })} data-testid={`entry-desc-${i}`} /></td>
      <td><select disabled={ro} className="fe-input py-1 text-xs" value={e.category} onChange={(x) => upd({ category: x.target.value })} data-testid={`entry-cat-${i}`}>{[...new Set([...CATS, e.category])].map((c) => <option key={c}>{c}</option>)}</select></td>
      <td><select disabled={ro} className="fe-input py-1 text-xs" value={e.link_type ? `${e.link_type}:${e.link_id}` : ""} onChange={(x) => { const [t, id] = x.target.value ? x.target.value.split(":") : [null, null]; upd({ link_type: t, link_id: id, link_label: crm.find((c) => c.value === x.target.value)?.label || null }); }} data-testid={`entry-link-${i}`}>
        <option value="">— None —</option>{crm.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></td>
      <td><input disabled={ro} className="fe-input py-1 text-sm" value={e.outcome} onChange={(x) => upd({ outcome: x.target.value })} data-testid={`entry-outcome-${i}`} /></td>
      <td>{!ro && <button type="button" onClick={del} className="text-rose-500" aria-label="Remove" data-testid={`entry-del-${i}`}><Trash2 size={14} /></button>}</td>
    </tr>
  );
}

export default function ReportForm({ report, onChanged, reviewSlot }) {
  const ro = !report.editable;
  const crm = useCrm();
  const [f, setF] = useState(report);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(report), [report]);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const body = () => ({ date: f.date, entries: f.entries.filter((e) => e.description?.trim()), pending: f.pending.filter((p) => p.description?.trim()),
    support_required: f.support_required, next_day_plan: f.next_day_plan, manual_counts: f.manual_counts });
  const act = async (submit) => {
    setBusy(true);
    try { const r = await (submit ? api.post("/daily-reports/day/submit", body()) : api.put("/daily-reports/day", body())); toast.success(submit ? "Daily report submitted" : "Draft saved"); onChanged(r.data); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const upload = async (file) => {
    if (!file) return;
    try {
      let r = f;
      if (!f.id) { r = (await api.put("/daily-reports/day", body())).data; }
      const fd = new FormData(); fd.append("file", file);
      await api.post(`/daily-reports/${r.id}/attachments`, fd);
      toast.success("Attachment uploaded");
      onChanged((await api.get("/daily-reports/day", { params: { date: f.date } })).data);
    } catch (e) { toast.error(errMsg(e)); }
  };
  const download = async (a) => {
    try {
      const r = await api.get(`/daily-reports/${f.id}/attachments/${a.id}`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data); const l = document.createElement("a"); l.href = url; l.download = a.filename; l.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(errMsg(e)); }
  };
  const removeAtt = async (a) => { try { await api.delete(`/daily-reports/${f.id}/attachments/${a.id}`); onChanged((await api.get("/daily-reports/day", { params: { date: f.date } })).data); } catch (e) { toast.error(errMsg(e)); } };
  const emp = f.employee || {};

  return (
    <div className="space-y-4" data-testid="daily-report-form">
      <Panel>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          {[["Employee", emp.name], ["Employee ID", emp.employee_id], ["Department", emp.department], ["Reporting date", f.date], ["Reviewer", f.reviewer?.name || "— (monitored by Super Admin)"]].map(([l, v]) => (
            <div key={l}><div className="fe-kpi-label">{l}</div><div className="font-semibold text-slate-800" data-testid={`report-${l.toLowerCase().replace(/\W+/g, "-")}`}>{v || "—"}</div></div>))}
          <div><div className="fe-kpi-label">Status</div><span className={`fe-chip ${STATUS_CLS[f.status] || "fe-chip-blue"}`} data-testid="report-status">{f.status}</span>{f.corrected && <span className="fe-chip fe-chip-purple ml-1">Corrected</span>}</div>
        </div>
        <div className={`mt-3 text-xs ${ro ? "text-rose-600" : "text-emerald-700"}`} data-testid="report-lock-reason">{!f.working_day && "Not a mandatory working day · "}{f.lock_reason}</div>
        {f.review_comment && <div className="mt-2 text-xs text-slate-600">HOD comment: “{f.review_comment}”</div>}
      </Panel>
      <Panel title="Activity counts" testid="report-counts">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {SYS.map(([k, l]) => <div key={k} className="rounded-md border border-slate-200 p-2.5"><div className="text-[11px] text-slate-500">{l}</div><div className="text-xl font-bold text-[#262262]" data-testid={`count-${k}`}>{f.system_counts?.[k] ?? 0}</div><div className="text-[10px] text-slate-400">From CRM / calendar</div></div>)}
          {MAN.map(([k, l]) => <div key={k} className="rounded-md border border-dashed border-slate-300 p-2.5"><div className="text-[11px] text-slate-500">{l}</div>
            <input type="number" min="0" disabled={ro} className="fe-input py-1 mt-1" value={f.manual_counts?.[k] ?? 0} onChange={(e) => set("manual_counts", { ...f.manual_counts, [k]: Math.max(0, Number(e.target.value || 0)) })} data-testid={`manual-${k}`} /><div className="text-[10px] text-slate-400">Manual (no system data)</div></div>)}
        </div>
      </Panel>
      <Panel title="Activities performed" right={!ro && <button type="button" className="fe-btn-secondary text-xs flex items-center gap-1" onClick={() => set("entries", [...f.entries, { description: "", category: "Other", outcome: "" }])} data-testid="entry-add"><Plus size={12} /> Add entry</button>}>
        <div className="overflow-x-auto"><table className="fe-table"><thead><tr><th className="w-2/5">Description</th><th>Category</th><th>Linked lead / account / opportunity</th><th>Outcome</th><th /></tr></thead>
          <tbody>{f.entries.map((e, i) => <EntryRow key={e.id || i} e={e} i={i} ro={ro} crm={crm} upd={(p) => set("entries", f.entries.map((x, j) => (j === i ? { ...x, ...p } : x)))} del={() => set("entries", f.entries.filter((_, j) => j !== i))} />)}
            {!f.entries.length && <tr><td colSpan={5} className="text-center text-slate-400 text-sm py-4">No entries. Completed calendar activities for the day are pre-filled automatically.</td></tr>}</tbody></table></div>
      </Panel>
      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="Pending activities & reasons for delay" right={!ro && <button type="button" className="fe-btn-secondary text-xs" onClick={() => set("pending", [...f.pending, { description: "", reason: "" }])} data-testid="pending-add">+ Add</button>}>
          <div className="space-y-2">{f.pending.map((p, i) => (
            <div key={i} className="grid grid-cols-2 gap-2"><input disabled={ro} className="fe-input py-1 text-sm" placeholder="Pending activity" value={p.description} onChange={(e) => set("pending", f.pending.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} data-testid={`pending-desc-${i}`} />
              <input disabled={ro} className="fe-input py-1 text-sm" placeholder="Reason for delay" value={p.reason} onChange={(e) => set("pending", f.pending.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))} data-testid={`pending-reason-${i}`} /></div>))}
            {!f.pending.length && <div className="text-sm text-slate-400">None</div>}</div>
        </Panel>
        <Panel title="Support required from management"><textarea rows={3} disabled={ro} className="fe-input" value={f.support_required} onChange={(e) => set("support_required", e.target.value)} data-testid="report-support" /></Panel>
      </div>
      <Panel title="Next-day action plan *"><textarea rows={3} disabled={ro} className="fe-input" value={f.next_day_plan} onChange={(e) => set("next_day_plan", e.target.value)} data-testid="report-next-plan" /></Panel>
      <Panel title="Supporting documents" right={!ro && <label className="fe-btn-secondary text-xs cursor-pointer flex items-center gap-1"><Paperclip size={12} /> Attach file<input type="file" className="hidden" onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} data-testid="attach-input" /></label>}>
        <ul className="text-sm space-y-1">{f.attachments.map((a) => (
          <li key={a.id} className="flex items-center gap-3"><button type="button" className="text-[#264494] hover:underline" onClick={() => download(a)} data-testid={`attachment-${a.id}`}>{a.filename}</button>
            <span className="text-xs text-slate-400">{Math.ceil(a.size / 1024)} KB</span>{!ro && <button type="button" className="text-xs text-rose-500" onClick={() => removeAtt(a)}>Remove</button>}</li>))}
          {!f.attachments.length && <li className="text-slate-400">No attachments. PDF, images, Office files, CSV or TXT up to 10 MB.</li>}</ul>
      </Panel>
      <div className="flex flex-wrap justify-end gap-2">
        {reviewSlot}
        {!ro && <><button className="fe-btn-secondary" disabled={busy} onClick={() => act(false)} data-testid="report-save">Save draft</button>
          <button className="fe-btn-primary" disabled={busy} onClick={() => act(true)} data-testid="report-submit">Submit report</button></>}
      </div>
    </div>
  );
}
