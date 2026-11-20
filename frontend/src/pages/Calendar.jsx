import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { toast } from "sonner";
import { Panel, Loading } from "@/components/dash/ui";
import { MonthView, WeekView, DayView, YearView, AgendaView } from "@/components/calendar/Views";
import EventDialog from "@/components/calendar/EventDialog";
import { TYPE_COLORS, rangeFor, step, title, todayKey } from "@/components/calendar/utils";

const VIEWS = ["year", "month", "week", "day", "agenda"];

export default function CalendarPage() {
  const [view, setView] = useState("month");
  const [anchor, setAnchor] = useState(todayKey());
  const [scope, setScope] = useState("team");
  const [events, setEvents] = useState(null);
  const [meta, setMeta] = useState(null);
  const [dlg, setDlg] = useState(null);
  const [types, setTypes] = useState([]);

  useEffect(() => { api.get("/calendar/meta").then((r) => setMeta(r.data)); }, []);
  const load = useCallback(() => {
    const [start, end] = rangeFor(view, anchor);
    api.get("/calendar/events", { params: { start, end, scope } }).then((r) => setEvents(r.data)).catch((e) => toast.error(errMsg(e)));
  }, [view, anchor, scope]);
  useEffect(() => { load(); }, [load]);

  const shown = (events || []).filter((e) => !types.length || types.includes(e.activity_type));
  const props = { anchor, events: shown, onOpen: (e) => setDlg({ event: e }), onNew: (day, hour) => setDlg({ day, hour }) };

  return (
    <div className="space-y-5" data-testid="calendar-page">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold" style={{ color: "#262262" }}>Calendar &amp; Activities</h1>
        <p className="text-sm text-slate-500 mt-1">Meetings, sales calls, follow-ups, tasks, deadlines and reminders. Completed activities feed your KPIs and daily report.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="fe-btn-secondary text-sm" onClick={() => setAnchor(todayKey())} data-testid="cal-today">Today</button>
        <button className="fe-btn-secondary px-2" onClick={() => setAnchor(step(view, anchor, -1))} data-testid="cal-prev" aria-label="Previous"><ChevronLeft size={16} /></button>
        <button className="fe-btn-secondary px-2" onClick={() => setAnchor(step(view, anchor, 1))} data-testid="cal-next" aria-label="Next"><ChevronRight size={16} /></button>
        <h2 className="text-base md:text-lg font-semibold text-[#262262] ml-2" data-testid="cal-title">{title(view, anchor)}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-slate-200 overflow-hidden text-sm" data-testid="cal-scope">
            {[["mine", "My calendar"], ["team", "Team calendar"]].map(([k, l]) => (
              <button key={k} onClick={() => setScope(k)} className={`px-3 py-1.5 ${scope === k ? "bg-[#264494] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`} data-testid={`cal-scope-${k}`}>{l}</button>))}
          </div>
          <div className="flex rounded-md border border-slate-200 overflow-hidden text-sm" data-testid="cal-views">
            {VIEWS.map((v) => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 capitalize ${view === v ? "bg-[#264494] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`} data-testid={`cal-view-${v}`}>{v}</button>))}
          </div>
          <button className="fe-btn-primary text-sm flex items-center gap-1" onClick={() => setDlg({ day: anchor, hour: 10 })} data-testid="cal-new"><Plus size={14} /> New activity</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5" data-testid="cal-type-filter">
        {Object.entries(TYPE_COLORS).filter(([t]) => t !== "Busy").map(([t, c]) => {
          const on = !types.length || types.includes(t);
          return <button key={t} onClick={() => setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t])}
            className={`fe-chip transition-opacity ${on ? "" : "opacity-40"}`} style={{ background: `${c}1A`, color: c }} data-testid={`cal-type-${t.replace(/\W+/g, "-").toLowerCase()}`}>{t}</button>;
        })}
      </div>
      <Panel>
        {!events || !meta ? <Loading /> : (
          <>
            {view === "month" && <MonthView {...props} />}
            {view === "week" && <WeekView {...props} />}
            {view === "day" && <DayView {...props} />}
            {view === "year" && <YearView {...props} onPick={(k) => { setAnchor(k); setView("day"); }} />}
            {view === "agenda" && <AgendaView {...props} />}
          </>
        )}
      </Panel>
      {dlg && meta && <EventDialog {...dlg} meta={meta} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); load(); }} />}
    </div>
  );
}
