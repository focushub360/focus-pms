import React, { useEffect, useState } from "react";
import {
  X,
  Calendar,
  Clock,
  MapPin,
  Users,
  Target,
  FileText,
  CheckCircle2,
  Trash2,
  AlertCircle,
  Sparkles,
  Link2,
  Tag,
  Check,
} from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { toLocalInput, fromLocalInput, timeOf, label, keyOf } from "./utils";

const ACTIVITY_TYPES = [
  { name: "Appointment", color: "bg-teal-50 text-teal-700 border-teal-300 ring-teal-500/20" },
  { name: "Task", color: "bg-amber-50 text-amber-800 border-amber-300 ring-amber-500/20" },
  { name: "Follow-up", color: "bg-blue-50 text-blue-700 border-blue-300 ring-blue-500/20" },
  { name: "Customer Meeting", color: "bg-cyan-50 text-cyan-800 border-cyan-300 ring-cyan-500/20" },
  { name: "Sales Call", color: "bg-emerald-50 text-emerald-700 border-emerald-300 ring-emerald-500/20" },
  { name: "Meeting", color: "bg-indigo-50 text-indigo-700 border-indigo-300 ring-indigo-500/20" },
  { name: "Project Deadline", color: "bg-rose-50 text-rose-700 border-rose-300 ring-rose-500/20" },
];

const PRIORITIES = [
  { value: "High", label: "High", badge: "bg-rose-50 text-rose-700 border-rose-200" },
  { value: "Medium", label: "Medium", badge: "bg-amber-50 text-amber-800 border-amber-200" },
  { value: "Low", label: "Low", badge: "bg-slate-50 text-slate-700 border-slate-200" },
];

const blank = (k, h = 10) => ({
  title: "",
  activity_type: "Task",
  priority: "High",
  metric_target: "",
  metric_current: "",
  start: `${k}T${String(h).padStart(2, "0")}:00`,
  end: `${k}T${String(h).padStart(2, "0")}:30`,
  all_day: false,
  visibility: "PRIVATE",
  status: "Planned",
  attendee_ids: [],
  location: "",
  notes: "",
  outcome: "",
  link: "",
  reminder_minutes: "",
  repeat: "",
  until: "",
});

function useCrm() {
  const [opts, setOpts] = useState([]);
  useEffect(() => {
    const get = (u, t, f) =>
      api
        .get(u)
        .then((r) =>
          r.data.map((x) => ({
            value: `${t}:${x.id}`,
            label: `${t[0].toUpperCase() + t.slice(1)} · ${f(x)}`,
          }))
        )
        .catch(() => []);

    Promise.all([
      get("/leads", "lead", (x) => `${x.name} (${x.company})`),
      get("/accounts", "account", (x) => x.name),
      get("/opportunities", "opportunity", (x) => x.title),
    ]).then((a) => setOpts(a.flat()));
  }, []);
  return opts;
}

function ReadonlyModal({ e, onClose }) {
  return (
    <div className="space-y-4" data-testid="event-readonly">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <h3 className="text-xl font-bold text-[#262262]">{e.title}</h3>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div className="text-slate-600 text-sm">
        {label(keyOf(e.start_at), { weekday: "long", day: "numeric", month: "long" })} ·{" "}
        {e.all_day ? "All day" : `${timeOf(e.start_at)} – ${timeOf(e.end_at)}`}
      </div>

      {e.busy ? (
        <div className="p-4 bg-slate-50 rounded-2xl text-slate-500 text-sm">
          A colleague's private activity. Details are not shared.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="fe-chip fe-chip-blue">{e.activity_type}</span>
            <span className="text-xs text-slate-500">
              {e.visibility === "TEAM" ? "Shared team event" : "Private"}
            </span>
          </div>
          {e.location && (
            <div className="text-xs text-slate-600 flex items-center gap-1.5">
              <MapPin size={14} className="text-slate-400" />
              <span>{e.location}</span>
            </div>
          )}
          {e.notes && (
            <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 leading-relaxed">
              {e.notes}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end pt-3">
        <button className="fe-btn-secondary" onClick={onClose} data-testid="event-close">
          Close
        </button>
      </div>
    </div>
  );
}

export default function EventDialog({ event, day, hour, meta, onClose, onSaved }) {
  const { user } = useAuth();
  const crm = useCrm();

  const editable =
    !event ||
    (!event.system && !event.busy && (event.assigned_to === user.id || event.created_by === user.id));

  const [f, setF] = useState(() =>
    event && !event.system && !event.busy
      ? {
          ...event,
          start: toLocalInput(event.start_at),
          end: toLocalInput(event.end_at),
          reminder_minutes: event.reminder_minutes ?? "",
          link: event.opportunity_id
            ? `opportunity:${event.opportunity_id}`
            : event.account_id
            ? `account:${event.account_id}`
            : event.lead_id
            ? `lead:${event.lead_id}`
            : "",
        }
      : blank(day, hour)
  );

  const set = (k) => (e) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const save = async (ev, status) => {
    ev?.preventDefault();
    if (!f.title.trim()) {
      return toast.error("Please enter a title");
    }

    const [lt, lid] = f.link ? f.link.split(":") : [null, null];
    const body = {
      title: f.title.trim(),
      activity_type: f.activity_type,
      start_at: fromLocalInput(f.start),
      end_at: fromLocalInput(f.end),
      all_day: f.all_day,
      visibility: f.visibility,
      status: status || f.status,
      priority: f.priority || "Normal",
      metric_target:
        f.metric_target !== "" && f.metric_target !== null && f.metric_target !== undefined
          ? Number(f.metric_target)
          : null,
      metric_current:
        f.metric_current !== "" && f.metric_current !== null && f.metric_current !== undefined
          ? Number(f.metric_current)
          : null,
      attendee_ids: f.attendee_ids,
      location: f.location,
      notes: f.notes,
      outcome: f.outcome,
      lead_id: lt === "lead" ? lid : null,
      account_id: lt === "account" ? lid : null,
      opportunity_id: lt === "opportunity" ? lid : null,
      reminder_minutes: f.reminder_minutes === "" ? null : Number(f.reminder_minutes),
      assigned_to: f.assigned_to || null,
      recurrence: !event && f.repeat ? { freq: f.repeat, until: f.until } : null,
    };

    if (!event && f.repeat && !f.until) {
      return toast.error("Choose a repeat-until date");
    }

    const scope = event?.series_id && f.applySeries ? "?scope=series" : "";
    try {
      if (event) {
        await api.patch(`/calendar/events/${event.id}${scope}`, body);
      } else {
        await api.post("/calendar/events", body);
      }
      toast.success(status === "Completed" ? "Marked completed" : "Activity saved");
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const remove = async () => {
    try {
      await api.delete(
        `/calendar/events/${event.id}${event.series_id && f.applySeries ? "?scope=series" : ""}`
      );
      toast.success("Activity deleted");
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const isTask = f.activity_type === "Task";
  const hasTarget = f.metric_target !== "" && f.metric_target !== null && f.metric_target !== undefined;
  const currentVal = Number(f.metric_current) || 0;
  const targetVal = Number(f.metric_target) || 0;
  const progressPct = targetVal > 0 ? Math.min(Math.round((currentVal / targetVal) * 100), 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        data-testid="event-dialog"
      >
        {!editable ? (
          <div className="p-6">
            <ReadonlyModal e={event} onClose={onClose} />
          </div>
        ) : (
          <form onSubmit={save} className="flex flex-col h-full overflow-hidden">
            {/* ──────── Modal Header ──────── */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50/80 via-white to-blue-50/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#007AFF] to-[#5856D6] text-white flex items-center justify-center shadow-sm">
                  <Calendar size={20} />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-[#262262]">
                    {event ? "Edit Activity" : "New Activity"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Schedule appointments, meetings, follow-ups or action tasks.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* ──────── Modal Scrollable Body ──────── */}
            <div className="p-6 space-y-4 overflow-y-auto fe-scroll flex-1">
              {/* Title input */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Activity Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Test drive - S. Kulkarni (Alpha X5)"
                  value={f.title}
                  onChange={set("title")}
                  required
                  className="fe-input text-sm font-semibold py-2.5 px-3.5 rounded-xl border-slate-300 focus:border-[#007AFF]"
                  data-testid="event-title"
                  autoFocus
                />
              </div>

              {/* Activity Type Pill Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Activity Type
                </label>
                <div className="flex flex-wrap gap-2">
                  {ACTIVITY_TYPES.map((t) => {
                    const isSelected = f.activity_type === t.name;
                    return (
                      <button
                        type="button"
                        key={t.name}
                        onClick={() => setF({ ...f, activity_type: t.name })}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 active:scale-95 ${
                          isSelected
                            ? `${t.color} ring-2 ring-offset-1 shadow-xs`
                            : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {isSelected && <Check size={13} strokeWidth={3} />}
                        <span>{t.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Priority & Status Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Priority
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {PRIORITIES.map((p) => {
                      const isSelected = (f.priority || "High") === p.value;
                      return (
                        <button
                          type="button"
                          key={p.value}
                          onClick={() => setF({ ...f, priority: p.value })}
                          className={`py-1.5 px-2 rounded-xl text-xs font-semibold border text-center transition-all ${
                            isSelected
                              ? `${p.badge} ring-2 ring-offset-1 font-bold`
                              : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Status
                  </label>
                  <select
                    className="fe-input py-2 text-xs sm:text-sm"
                    value={f.status}
                    onChange={set("status")}
                    data-testid="event-status"
                  >
                    {(meta?.statuses || ["Planned", "Completed", "Cancelled"]).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quantitative Target (Shown dynamically for Tasks) */}
              {isTask && (
                <div className="p-4 bg-gradient-to-r from-amber-50/50 to-orange-50/30 rounded-2xl border border-amber-200/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                      <Target size={15} className="text-amber-600" />
                      Quantitative Achievement Target (Optional)
                    </span>
                    {hasTarget && (
                      <span className="text-xs font-bold text-amber-800">
                        {currentVal} / {targetVal} ({progressPct}%)
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[11px] text-amber-800 font-medium block mb-1">Target Goal</span>
                      <input
                        type="number"
                        placeholder="e.g. 15 (leads / calls)"
                        value={f.metric_target ?? ""}
                        onChange={set("metric_target")}
                        className="fe-input py-1.5 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-amber-800 font-medium block mb-1">Current Achieved</span>
                      <input
                        type="number"
                        placeholder="e.g. 6"
                        value={f.metric_current ?? ""}
                        onChange={set("metric_current")}
                        className="fe-input py-1.5 text-xs bg-white"
                      />
                    </div>
                  </div>

                  {hasTarget && targetVal > 0 && (
                    <div className="w-full bg-amber-200/60 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-amber-600 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Date & Time Picker */}
              <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <Clock size={14} className="text-slate-500" />
                    Date &amp; Time
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={f.all_day}
                      onChange={set("all_day")}
                      className="w-4 h-4 rounded text-[#007AFF] focus:ring-0 cursor-pointer"
                      data-testid="event-allday"
                    />
                    <span className="text-xs font-semibold text-slate-700">All day</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">Starts At</span>
                    <input
                      type="datetime-local"
                      className="fe-input py-1.5 text-xs bg-white"
                      value={f.start}
                      onChange={set("start")}
                      data-testid="event-start"
                      required
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">Ends At</span>
                    <input
                      type="datetime-local"
                      className="fe-input py-1.5 text-xs bg-white"
                      value={f.end}
                      onChange={set("end")}
                      data-testid="event-end"
                      required
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Visibility:</span>
                    <select
                      className="fe-input py-1 text-xs w-auto bg-white"
                      value={f.visibility}
                      onChange={set("visibility")}
                      data-testid="event-visibility"
                    >
                      <option value="PRIVATE">Private (Colleagues see “Busy”)</option>
                      <option value="TEAM">Shared Team Activity</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Reminder:</span>
                    <select
                      className="fe-input py-1 text-xs w-auto bg-white"
                      value={f.reminder_minutes}
                      onChange={set("reminder_minutes")}
                      data-testid="event-reminder"
                    >
                      <option value="">None</option>
                      <option value="15">15 min before</option>
                      <option value="60">1 hour before</option>
                      <option value="1440">1 day before</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* CRM Linkage */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
                  <Link2 size={13} className="text-slate-400" />
                  Link to CRM Record (Optional)
                </label>
                <select
                  className="fe-input py-2 text-xs sm:text-sm"
                  value={f.link}
                  onChange={set("link")}
                  data-testid="event-link"
                >
                  <option value="">None (Standalone activity)</option>
                  {crm.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Location / Meeting link */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
                  <MapPin size={13} className="text-slate-400" />
                  Location / Meeting Link
                </label>
                <input
                  type="text"
                  placeholder="e.g. Showroom Bay 2, Client Office, or Zoom link"
                  value={f.location}
                  onChange={set("location")}
                  className="fe-input py-2 text-xs sm:text-sm"
                />
              </div>

              {/* Attendees */}
              {meta?.people?.length > 0 && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
                    <Users size={13} className="text-slate-400" />
                    Team Attendees
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {meta.people
                      .filter((p) => p.id !== (f.assigned_to || user.id))
                      .map((p) => {
                        const on = f.attendee_ids.includes(p.id);
                        return (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() =>
                              setF({
                                ...f,
                                attendee_ids: on
                                  ? f.attendee_ids.filter((x) => x !== p.id)
                                  : [...f.attendee_ids, p.id],
                              })
                            }
                            className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all ${
                              on
                                ? "bg-blue-50 text-[#007AFF] border border-blue-200 font-semibold"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                            data-testid={`attendee-${p.id}`}
                          >
                            {p.name}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Notes & Outcome */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Prospect preferences, meeting agenda..."
                    value={f.notes}
                    onChange={set("notes")}
                    className="fe-input py-2 text-xs leading-relaxed"
                    data-testid="event-notes"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Outcome (For Daily Activity Report)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Test drive feedback, deal stage update..."
                    value={f.outcome}
                    onChange={set("outcome")}
                    className="fe-input py-2 text-xs leading-relaxed"
                    data-testid="event-outcome"
                  />
                </div>
              </div>
            </div>

            {/* ──────── Modal Sticky Footer ──────── */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2">
              <div>
                {event && event.status !== "Completed" && (
                  <button
                    type="button"
                    onClick={remove}
                    className="flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-xl font-semibold transition-colors"
                    data-testid="event-delete"
                  >
                    <Trash2 size={14} />
                    <span>Delete</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="fe-btn-secondary text-xs sm:text-sm"
                  onClick={onClose}
                >
                  Cancel
                </button>
                {event && f.status !== "Completed" && (
                  <button
                    type="button"
                    className="fe-btn-secondary text-xs sm:text-sm text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                    onClick={() => save(null, "Completed")}
                    data-testid="event-complete"
                  >
                    <CheckCircle2 size={15} />
                    <span>Mark completed</span>
                  </button>
                )}
                <button
                  type="submit"
                  className="fe-btn-primary text-xs sm:text-sm"
                  data-testid="event-save"
                >
                  Save activity
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
