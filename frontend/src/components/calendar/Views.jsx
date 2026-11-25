import { TYPE_COLORS, eventsOn, monthGridSun, todayKey, dayNum, label, addDays, weekStartSun, hourOf, timeOf, keyOf, addMonths } from "./utils";
import { Empty } from "@/components/dash/ui";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 8);

export function Chip({ e, onOpen, compact }) {
  const c = TYPE_COLORS[e.activity_type] || "#264494";
  return (
    <button
      type="button"
      onClick={(ev) => {
        ev.stopPropagation();
        onOpen(e);
      }}
      data-testid={`event-${e.id}`}
      className={`w-full text-left truncate rounded-lg px-2 font-medium transition-all ${
        compact ? "text-[11px] py-0.5" : "text-xs py-1"
      } hover:brightness-95 text-slate-900 shadow-2xs ${
        e.status === "Cancelled" ? "line-through opacity-50" : ""
      }`}
      style={{
        background: `${c}1A`,
        color: c,
        borderLeft: `3px solid ${c}`,
      }}
    >
      {!e.all_day && <span className="font-bold mr-1 text-slate-700">{timeOf(e.start_at)}</span>}
      {e.title}
    </button>
  );
}

export function MonthView({ anchor, events, onOpen, onNew }) {
  const days = monthGridSun(anchor);
  const t = todayKey();
  return (
    <div
      className="grid grid-cols-7 border-l border-t border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-xs"
      data-testid="month-view"
    >
      {DOW.map((d) => (
        <div
          key={d}
          className="text-[11px] font-bold uppercase text-slate-400 px-2 py-2 border-r border-b border-slate-200/80 bg-slate-50/80 text-center"
        >
          {d}
        </div>
      ))}
      {days.map((k) => {
        const ev = eventsOn(events, k);
        const isCurrent = k.slice(0, 7) === anchor.slice(0, 7);
        return (
          <div
            key={k}
            onClick={() => onNew(k)}
            data-testid={`day-cell-${k}`}
            className={`min-h-[104px] border-r border-b border-slate-200/80 p-2 cursor-pointer hover:bg-slate-50/80 transition-colors ${
              !isCurrent ? "bg-slate-50/50 text-slate-400 opacity-50" : ""
            }`}
          >
            <div
              className={`text-xs mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                k === t ? "bg-[#007AFF] text-white font-bold" : "text-slate-700"
              }`}
            >
              {dayNum(k)}
            </div>
            <div className="space-y-0.5">
              {ev.slice(0, 3).map((e) => (
                <Chip key={e.id} e={e} onOpen={onOpen} compact />
              ))}
              {ev.length > 3 && (
                <div className="text-[10px] text-slate-500 px-1 font-semibold">
                  +{ev.length - 3} more
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TimeGrid({ days, events, onOpen, onNew }) {
  const t = todayKey();
  return (
    <div
      className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-xs"
      data-testid={days.length === 1 ? "day-view" : "week-view"}
    >
      <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
        <div className="border-b border-slate-200 bg-slate-50/50" />
        {days.map((k) => (
          <div
            key={k}
            className={`text-center py-2.5 border-b border-slate-200 text-xs ${
              k === t ? "text-[#007AFF] font-bold bg-blue-50/30" : "text-slate-600 bg-slate-50/50"
            }`}
          >
            {label(k, { weekday: "short" })}{" "}
            <span
              className={`text-sm ml-1 font-bold ${
                k === t ? "px-2 py-0.5 rounded-full bg-[#007AFF] text-white" : ""
              }`}
            >
              {dayNum(k)}
            </span>
            <div className="space-y-0.5 px-1 mt-1">
              {eventsOn(events, k)
                .filter((e) => e.all_day)
                .map((e) => (
                  <Chip key={e.id} e={e} onOpen={onOpen} compact />
                ))}
            </div>
          </div>
        ))}
        <div className="relative">
          {HOURS.map((h) => (
            <div key={h} className="h-12 text-[10px] text-slate-400 text-right pr-2 -mt-1.5">
              {`${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`}
            </div>
          ))}
        </div>
        {days.map((k) => (
          <div key={k} className="relative border-l border-slate-100">
            {HOURS.map((h) => (
              <div
                key={h}
                onClick={() => onNew(k, h)}
                className="h-12 border-b border-slate-100 hover:bg-slate-50/80 cursor-pointer transition-colors"
              />
            ))}
            {eventsOn(events, k)
              .filter((e) => !e.all_day)
              .map((e) => {
                const s = keyOf(e.start_at) < k ? 8 : Math.max(hourOf(e.start_at), 8);
                const en = keyOf(e.end_at) > k ? 22 : Math.min(Math.max(hourOf(e.end_at), s + 0.5), 22);
                return (
                  <div
                    key={e.id}
                    className="absolute left-1 right-1 z-10"
                    style={{
                      top: (s - 8) * 48,
                      height: Math.max((en - s) * 48 - 3, 22),
                    }}
                  >
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

export const WeekView = (p) => (
  <TimeGrid {...p} days={Array.from({ length: 7 }, (_, i) => addDays(weekStartSun(p.anchor), i))} />
);

export const DayView = (p) => <TimeGrid {...p} days={[p.anchor]} />;

export function AgendaView({ anchor, events, onOpen }) {
  const days = Array.from({ length: 31 }, (_, i) => addDays(anchor, i))
    .map((k) => [k, eventsOn(events, k)])
    .filter(([, ev]) => ev.length);

  if (!days.length) {
    return <Empty text="No activities scheduled in the next 30 days." />;
  }

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200/80 p-5 divide-y divide-slate-100 shadow-xs"
      data-testid="agenda-view"
    >
      {days.map(([k, ev]) => (
        <div key={k} className="flex flex-col sm:flex-row gap-2 sm:gap-4 py-3.5">
          <div className="w-36 shrink-0 text-sm font-bold text-[#262262]">
            {label(k, { weekday: "short", day: "numeric", month: "short" })}
          </div>
          <div className="flex-1 space-y-1.5">
            {ev.map((e) => (
              <div key={e.id} className="flex items-center gap-3">
                <span className="w-32 text-xs text-slate-500">
                  {e.all_day ? "All day" : `${timeOf(e.start_at)} – ${timeOf(e.end_at)}`}
                </span>
                <div className="flex-1 max-w-xl">
                  <Chip e={e} onOpen={onOpen} />
                </div>
                <span className="text-[11px] text-slate-500 w-28 truncate hidden sm:inline">
                  {e.activity_type}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function YearView({ anchor, events, onPick }) {
  const t = todayKey();
  const months = Array.from({ length: 12 }, (_, i) => addMonths(`${anchor.slice(0, 4)}-01-01`, i));
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs"
      data-testid="year-view"
    >
      {months.map((m) => (
        <div key={m} className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/70">
          <div className="text-sm font-bold text-[#262262] mb-2">{label(m, { month: "long" })}</div>
          <div className="grid grid-cols-7 text-[10px] text-center gap-y-1">
            {DOW.map((d) => (
              <div key={d} className="text-slate-400 font-semibold">
                {d[0]}
              </div>
            ))}
            {monthGridSun(m).map((k) => {
              const n = eventsOn(events, k).length;
              const other = k.slice(0, 7) !== m.slice(0, 7);
              return (
                <button
                  key={k}
                  onClick={() => onPick(k)}
                  className={`h-6 rounded-lg text-xs transition-all ${
                    other
                      ? "text-slate-300 opacity-40"
                      : "text-slate-700 hover:bg-slate-200/80"
                  } ${k === t ? "bg-[#007AFF] text-white font-bold" : ""}`}
                >
                  {dayNum(k)}
                  {n > 0 && !other && (
                    <span className="block w-1 h-1 mx-auto -mt-0.5 rounded-full bg-[#007AFF]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
