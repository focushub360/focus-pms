import { useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { toLocalInput, fromLocalInput, timeOf, label, keyOf } from "./utils";

const blank = (k, h = 10) => ({ title: "", activity_type: "Task", start: `${k}T${String(h).padStart(2, "0")}:00`, end: `${k}T${String(h).padStart(2, "0")}:30`,
  all_day: false, visibility: "PRIVATE", status: "Planned", attendee_ids: [], location: "", notes: "", outcome: "", link: "", reminder_minutes: "", repeat: "", until: "" });

function useCrm() {
  const [opts, setOpts] = useState([]);
  useEffect(() => {
    const get = (u, t, f) => api.get(u).then((r) => r.data.map((x) => ({ value: `${t}:${x.id}`, label: `${t[0].toUpperCase() + t.slice(1)} · ${f(x)}` }))).catch(() => []);
    Promise.all([get("/leads", "lead", (x) => `${x.name} (${x.company})`), get("/accounts", "account", (x) => x.name), get("/opportunities", "opportunity", (x) => x.title)])
      .then((a) => setOpts(a.flat()));
  }, []);
  return opts;
}

function Readonly({ e, onClose }) {
  return (
    <div className="space-y-2 text-sm" data-testid="event-readonly">
      <h3 className="text-lg font-bold text-[#262262]">{e.title}</h3>
      <div className="text-slate-600">{label(keyOf(e.start_at), { weekday: "long", day: "numeric", month: "long" })} · {e.all_day ? "All day" : `${timeOf(e.start_at)} – ${timeOf(e.end_at)}`}</div>
      {e.busy ? <div className="text-slate-500">A colleague's private activity. Details are not shared.</div> : <><div>{e.activity_type} · {e.visibility === "TEAM" ? "Team event" : "Private"}</div>{e.notes && <p className="text-slate-600">{e.notes}</p>}</>}
      <div className="flex justify-end pt-3"><button className="fe-btn-secondary" onClick={onClose} data-testid="event-close">Close</button></div>
    </div>
  );
}

export default function EventDialog({ event, day, hour, meta, onClose, onSaved }) {
  const { user } = useAuth();
  const crm = useCrm();
  const editable = !event || (!event.system && !event.busy && (event.assigned_to === user.id || event.created_by === user.id));
  const [f, setF] = useState(() => event && !event.system && !event.busy ? {
    ...event, start: toLocalInput(event.start_at), end: toLocalInput(event.end_at), reminder_minutes: event.reminder_minutes ?? "",
    link: event.opportunity_id ? `opportunity:${event.opportunity_id}` : event.account_id ? `account:${event.account_id}` : event.lead_id ? `lead:${event.lead_id}` : "",
  } : blank(day, hour));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const save = async (ev, status) => {
    ev?.preventDefault();
    const [lt, lid] = f.link ? f.link.split(":") : [null, null];
    const body = { title: f.title, activity_type: f.activity_type, start_at: fromLocalInput(f.start), end_at: fromLocalInput(f.end), all_day: f.all_day,
      visibility: f.visibility, status: status || f.status, attendee_ids: f.attendee_ids, location: f.location, notes: f.notes, outcome: f.outcome,
      lead_id: lt === "lead" ? lid : null, account_id: lt === "account" ? lid : null, opportunity_id: lt === "opportunity" ? lid : null,
      reminder_minutes: f.reminder_minutes === "" ? null : Number(f.reminder_minutes), assigned_to: f.assigned_to || null,
      recurrence: !event && f.repeat ? { freq: f.repeat, until: f.until } : null };
    if (!event && f.repeat && !f.until) return toast.error("Choose a repeat-until date");
    const scope = event?.series_id && f.applySeries ? "?scope=series" : "";
    try { event ? await api.patch(`/calendar/events/${event.id}${scope}`, body) : await api.post("/calendar/events", body); toast.success(status === "Completed" ? "Marked completed" : "Activity saved"); onSaved(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async () => { try { await api.delete(`/calendar/events/${event.id}${event.series_id && f.applySeries ? "?scope=series" : ""}`); toast.success("Activity deleted"); onSaved(); } catch (e) { toast.error(errMsg(e)); } };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl p-6 border border-slate-200 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="event-dialog">
        {!editable ? <Readonly e={event} onClose={onClose} /> : (
          <form onSubmit={save} className="space-y-3">
            <h3 className="text-lg font-bold text-[#262262]">{event ? "Edit activity" : "New activity"}</h3>
            <input className="fe-input" placeholder="Title" value={f.title} onChange={set("title")} required data-testid="event-title" />
            <div className="grid grid-cols-2 gap-3">
              <select className="fe-input" value={f.activity_type} onChange={set("activity_type")} data-testid="event-type">{meta.types.map((t) => <option key={t}>{t}</option>)}</select>
              <select className="fe-input" value={f.visibility} onChange={set("visibility")} data-testid="event-visibility"><option value="PRIVATE">Private (colleagues see “Busy”)</option><option value="TEAM">Shared team event</option></select>
              <input type="datetime-local" className="fe-input" value={f.start} onChange={set("start")} data-testid="event-start" />
              <input type="datetime-local" className="fe-input" value={f.end} onChange={set("end")} data-testid="event-end" />
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={f.all_day} onChange={set("all_day")} data-testid="event-allday" /> All day</label>
              <label className="flex items-center gap-2">Status <select className="fe-input py-1 w-auto" value={f.status} onChange={set("status")} data-testid="event-status">{meta.statuses.map((s) => <option key={s}>{s}</option>)}</select></label>
              <label className="flex items-center gap-2">Reminder <select className="fe-input py-1 w-auto" value={f.reminder_minutes} onChange={set("reminder_minutes")} data-testid="event-reminder">
                <option value="">None</option><option value="15">15 min before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></select></label>
            </div>
            {!event && <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">Repeat <select className="fe-input py-1 w-auto" value={f.repeat} onChange={set("repeat")} data-testid="event-repeat"><option value="">Does not repeat</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></select></label>
              {f.repeat && <label className="flex items-center gap-2">until <input type="date" className="fe-input py-1 w-auto" value={f.until} onChange={set("until")} data-testid="event-until" /></label>}
            </div>}
            {event?.series_id && <label className="flex items-center gap-2 text-sm text-[#264494]" data-testid="event-series-scope"><input type="checkbox" checked={!!f.applySeries} onChange={set("applySeries")} data-testid="event-apply-series" /> Apply save / delete to the entire series (completed occurrences are kept)</label>}
            <select className="fe-input" value={f.link} onChange={set("link")} data-testid="event-link"><option value="">Link to lead / account / opportunity (optional)</option>{crm.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            {meta.full_view && <select className="fe-input" value={f.assigned_to || user.id} onChange={set("assigned_to")} data-testid="event-owner">{meta.people.map((p) => <option key={p.id} value={p.id}>Owner: {p.name}</option>)}</select>}
            <div>
              <div className="fe-kpi-label mb-1">Attendees</div>
              <div className="flex flex-wrap gap-1.5">{meta.people.filter((p) => p.id !== (f.assigned_to || user.id)).map((p) => {
                const on = f.attendee_ids.includes(p.id);
                return <button type="button" key={p.id} onClick={() => setF({ ...f, attendee_ids: on ? f.attendee_ids.filter((x) => x !== p.id) : [...f.attendee_ids, p.id] })}
                  className={`fe-chip ${on ? "fe-chip-blue" : "bg-slate-100 text-slate-500"}`} data-testid={`attendee-${p.id}`}>{p.name}</button>;
              })}</div>
            </div>
            <input className="fe-input" placeholder="Location / meeting link" value={f.location} onChange={set("location")} />
            <textarea className="fe-input" rows={2} placeholder="Notes" value={f.notes} onChange={set("notes")} data-testid="event-notes" />
            <textarea className="fe-input" rows={2} placeholder="Outcome (used in your daily report)" value={f.outcome} onChange={set("outcome")} data-testid="event-outcome" />
            <div className="flex items-center gap-2 pt-2">
              {event && event.status !== "Completed" && <button type="button" className="text-xs text-rose-600 hover:underline" onClick={remove} data-testid="event-delete">Delete</button>}
              <span className="ml-auto" />
              <button type="button" className="fe-btn-secondary" onClick={onClose}>Cancel</button>
              {event && f.status !== "Completed" && <button type="button" className="fe-btn-secondary" onClick={() => save(null, "Completed")} data-testid="event-complete">Mark completed</button>}
              <button className="fe-btn-primary" data-testid="event-save">Save</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
