import { TYPE_COLORS, eventsOn, monthGrid, todayKey, dayNum, label, addDays, weekStart, hourOf, timeOf, keyOf, addMonths } from "./utils";
import { Empty } from "@/components/dash/ui";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 8);

export function Chip({ e, onOpen, compact }) {
  const c = TYPE_COLORS[e.activity_type] || "#264494";
  return (
    <button type="button" onClick={(ev) => { ev.stopPropagation(); onOpen(e); }} data-testid={`event-${e.id}`}
      className={`w-full text-left truncate rounded px-1.5 ${compact ? "text-[11px] py-0.5" : "text-xs py-1"} hover:brightness-95 transition-[filter] ${e.status === "Cancelled" ? "line-through opacity-60" : ""}`}
      style={{ background: `${c}1A`, color: c, borderLeft: `3px solid ${c}` }}>
      {!e.all_day && <span className="font-semibold mr-1">{timeOf(e.start_at)}</span>}{e.title}
    </button>
  );
}

export function MonthView({ anchor, events, onOpen, onNew }) {
  const days = monthGrid(anchor);
  const t = todayKey();
  return (
    <div className="grid grid-cols-7 border-l border-t border-slate-200" data-testid="month-view">
      {DOW.map((d) => <div key={d} className="text-[11px] font-semibold uppercase text-slate-500 px-2 py-1.5 border-r border-b border-slate-200 bg-slate-50">{d}</div>)}
      {days.map((k) => {
        const ev = eventsOn(events, k);
        return (
          <div key={k} onClick={() => onNew(k)} data-testid={`day-cell-${k}`}
            className={`min-h-[104px] border-r border-b border-slate-200 p-1 cursor-pointer hover:bg-slate-50 ${k.slice(0, 7) !== anchor.slice(0, 7) ? "bg-slate-50/60 text-slate-400" : ""}`}>
            <div className={`text-xs mb-1 w-6 h-6 flex items-center justify-center rounded-full ${k === t ? "bg-[#264494] text-white font-bold" : ""}`}>{dayNum(k)}</div>
            <div className="space-y-0.5">{ev.slice(0, 3).map((e) => <Chip key={e.id} e={e} onOpen={onOpen} compact />)}
              {ev.length > 3 && <div className="text-[10px] text-slate-500 px-1">+{ev.length - 3} more</div>}</div>
          </div>
        );
      })}
    </div>
  );
}

export function TimeGrid({ days, events, onOpen, onNew }) {
  const t = todayKey();
  return (
    <div className="overflow-x-auto" data-testid={days.length === 1 ? "day-view" : "week-view"}>
      <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
        <div />
        {days.map((k) => (
          <div key={k} className={`text-center py-2 border-b border-slate-200 text-xs ${k === t ? "text-[#264494] font-bold" : "text-slate-600"}`}>
            {label(k, { weekday: "short" })} <span className="text-base ml-1">{dayNum(k)}</span>
            <div className="space-y-0.5 px-1 mt-1">{eventsOn(events, k).filter((e) => e.all_day).map((e) => <Chip key={e.id} e={e} onOpen={onOpen} compact />)}</div>
          </div>
        ))}
        <div className="relative">{HOURS.map((h) => <div key={h} className="h-12 text-[10px] text-slate-400 text-right pr-2 -mt-1.5">{`${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`}</div>)}</div>
        {days.map((k) => (
          <div key={k} className="relative border-l border-slate-100">
            {HOURS.map((h) => <div key={h} onClick={() => onNew(k, h)} className="h-12 border-b border-slate-100 hover:bg-slate-50 cursor-pointer" />)}
            {eventsOn(events, k).filter((e) => !e.all_day).map((e) => {
              const s = keyOf(e.start_at) < k ? 8 : Math.max(hourOf(e.start_at), 8);
              const en = keyOf(e.end_at) > k ? 22 : Math.min(Math.max(hourOf(e.end_at), s + 0.5), 22);
              return (
                <div key={e.id} className="absolute left-0.5 right-0.5" style={{ top: (s - 8) * 48, height: Math.max((en - s) * 48 - 2, 20) }}>
                  <Chip e={e} onOpen={onOpen} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export const WeekView = (p) => <TimeGrid {...p} days={Array.from({ length: 7 }, (_, i) => addDays(weekStart(p.anchor), i))} />;
export const DayView = (p) => <TimeGrid {...p} days={[p.anchor]} />;

export function YearView({ anchor, events, onPick }) {
  const t = todayKey();
  const months = Array.from({ length: 12 }, (_, i) => addMonths(`${anchor.slice(0, 4)}-01-01`, i));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" data-testid="year-view">
      {months.map((m) => (
        <div key={m}>
          <div className="text-sm font-semibold text-[#262262] mb-1">{label(m, { month: "long" })}</div>
          <div className="grid grid-cols-7 text-[10px] text-center gap-y-0.5">
            {DOW.map((d) => <div key={d} className="text-slate-400">{d[0]}</div>)}
            {monthGrid(m).map((k) => {
              const n = eventsOn(events, k).length;
              const other = k.slice(0, 7) !== m.slice(0, 7);
              return (
                <button key={k} onClick={() => onPick(k)} data-testid={other ? undefined : `year-day-${k}`}
                  className={`h-6 rounded ${other ? "text-slate-300" : "text-slate-700 hover:bg-slate-100"} ${k === t ? "bg-[#264494] text-white" : ""}`}>
                  {dayNum(k)}{n > 0 && !other && <span className="block w-1 h-1 mx-auto -mt-0.5 rounded-full bg-[#F19A2F]" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AgendaView({ anchor, events, onOpen }) {
  const days = Array.from({ length: 31 }, (_, i) => addDays(anchor, i)).map((k) => [k, eventsOn(events, k)]).filter(([, ev]) => ev.length);
  if (!days.length) return <Empty text="No activities in the next 30 days." />;
  return (
    <div className="divide-y divide-slate-100" data-testid="agenda-view">
      {days.map(([k, ev]) => (
        <div key={k} className="flex gap-4 py-3">
          <div className="w-28 shrink-0 text-sm"><div className="font-semibold text-[#262262]">{label(k, { weekday: "short", day: "numeric", month: "short" })}</div></div>
          <div className="flex-1 space-y-1">{ev.map((e) => (
            <div key={e.id} className="flex items-center gap-3">
              <span className="w-32 text-xs text-slate-500">{e.all_day ? "All day" : `${timeOf(e.start_at)} – ${timeOf(e.end_at)}`}</span>
              <div className="flex-1 max-w-xl"><Chip e={e} onOpen={onOpen} /></div>
              <span className="text-[11px] text-slate-400 w-28 truncate">{e.activity_type}{e.status !== "Planned" && ` · ${e.status}`}</span>
            </div>))}</div>
        </div>
      ))}
    </div>
  );
}
