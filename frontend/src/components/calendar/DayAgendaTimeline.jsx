import React from "react";
import { Plus, Clock, MapPin, CheckCircle2, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { formatDayHeader, timeOf } from "./utils";

const TYPE_STYLES = {
  Appointment: "bg-teal-50 text-teal-700 border-teal-200",
  Task: "bg-amber-50 text-amber-800 border-amber-200",
  "Follow-up": "bg-blue-50 text-blue-700 border-blue-200",
  Meeting: "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Customer Meeting": "bg-cyan-50 text-cyan-800 border-cyan-200",
  "Sales Call": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Project Deadline": "bg-rose-50 text-rose-700 border-rose-200",
};

export default function DayAgendaTimeline({
  selectedDate,
  events = [],
  onOpenEvent,
  onNewEvent,
}) {
  const formattedHeading = formatDayHeader(selectedDate);

  // Filter events on selectedDate and sort chronologically
  const dayEvents = (events || [])
    .filter((e) => {
      const s = (e.start_at || "").slice(0, 10);
      const en = (e.end_at || "").slice(0, 10);
      return s <= selectedDate && en >= selectedDate;
    })
    .sort((a, b) => (a.start_at || "").localeCompare(b.start_at || ""));

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5"
      data-testid="day-agenda-timeline"
    >
      {/* Date Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#007AFF] flex items-center justify-center font-bold">
            <CalendarIcon size={16} />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-[#262262]">
              {formattedHeading}
            </h2>
            <p className="text-xs text-slate-500">
              {dayEvents.length} {dayEvents.length === 1 ? "activity" : "activities"} scheduled
            </p>
          </div>
        </div>

        <button
          onClick={() => onNewEvent(selectedDate, 10)}
          className="fe-btn-secondary text-xs px-3 py-1.5"
          data-testid="agenda-add-btn"
        >
          <Plus size={14} />
          <span>Add event</span>
        </button>
      </div>

      {/* Activities Timeline */}
      <div className="pt-2 divide-y divide-slate-100 space-y-1">
        {dayEvents.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500">
            <p>No activities scheduled for this day.</p>
            <button
              onClick={() => onNewEvent(selectedDate, 10)}
              className="mt-2 text-xs font-semibold text-[#007AFF] hover:underline"
            >
              + Schedule an activity now
            </button>
          </div>
        ) : (
          dayEvents.map((e) => {
            const timeStr = e.all_day
              ? "All day"
              : e.start_at
              ? timeOf(e.start_at)
              : "10:00 AM";

            const badgeCls =
              TYPE_STYLES[e.activity_type] || "bg-indigo-50 text-indigo-700 border-indigo-200";

            return (
              <div
                key={e.id}
                onClick={() => onOpenEvent(e)}
                className="py-2.5 px-2 rounded-xl flex items-center gap-3 sm:gap-4 transition-colors hover:bg-slate-50/80 cursor-pointer group"
                data-testid={`agenda-item-${e.id}`}
              >
                {/* 1. Time stamp */}
                <div className="w-16 sm:w-20 shrink-0 font-medium text-xs sm:text-sm text-slate-500 flex items-center gap-1">
                  <Clock size={12} className="text-slate-400 shrink-0 hidden sm:inline" />
                  <span>{timeStr}</span>
                </div>

                {/* 2. Type badge pill */}
                <div className="shrink-0">
                  <span
                    className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${badgeCls}`}
                  >
                    {e.activity_type}
                  </span>
                </div>

                {/* 3. Event title & meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs sm:text-sm font-semibold truncate ${
                        e.status === "Completed"
                          ? "line-through text-slate-400"
                          : "text-slate-900 group-hover:text-[#007AFF]"
                      }`}
                    >
                      {e.title}
                    </span>
                    {e.status === "Completed" && (
                      <span className="text-[10px] text-emerald-600 flex items-center gap-0.5 font-medium">
                        <CheckCircle2 size={12} /> Done
                      </span>
                    )}
                  </div>
                  {e.location && (
                    <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <MapPin size={10} /> {e.location}
                    </div>
                  )}
                </div>

                {/* 4. Action arrow */}
                <div className="shrink-0 text-slate-400 group-hover:text-slate-600 transition-colors">
                  <ChevronRight size={16} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
