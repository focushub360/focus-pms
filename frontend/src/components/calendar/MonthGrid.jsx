import React, { useMemo } from "react";
import { monthGridSun, dayNum, todayKey } from "./utils";

const DOW_SUN = ["S", "M", "T", "W", "T", "F", "S"];

function getChipStyle(e) {
  const type = e.activity_type || "";
  const title = (e.title || "").toLowerCase();

  if (title.includes("target") || type === "Sales Call") {
    return "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-l-2 border-emerald-500";
  }
  if (type === "Task" || title.includes("leads") || title.includes("quotation")) {
    return "bg-amber-50 hover:bg-amber-100 text-amber-900 border-l-2 border-amber-500";
  }
  if (type === "Appointment" || title.includes("test drive") || title.includes("walk-in")) {
    return "bg-teal-50 hover:bg-teal-100 text-teal-800 border-l-2 border-teal-500";
  }
  if (type === "Follow-up") {
    return "bg-blue-50 hover:bg-blue-100 text-blue-800 border-l-2 border-blue-500";
  }
  if (type === "Customer Meeting") {
    return "bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border-l-2 border-cyan-500";
  }
  return "bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-l-2 border-indigo-500";
}

export default function MonthGrid({
  anchor,
  selectedDate,
  onSelectDate,
  eventsByDay = {},
  onOpenEvent,
  onNewEvent,
}) {
  const days = useMemo(() => monthGridSun(anchor), [anchor]);
  const currentMonthPrefix = anchor.slice(0, 7);
  const today = todayKey();

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-3.5 sm:p-4"
      data-testid="month-grid-container"
    >
      {/* 7 Columns Headers: S M T W T F S */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-2">
        {DOW_SUN.map((d, idx) => (
          <div
            key={idx}
            className="text-center font-bold text-[11px] uppercase tracking-wider text-slate-400 py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* 42 Day Cells Grid */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {days.map((k) => {
          const isSelected = k === selectedDate;
          const isToday = k === today;
          const isCurrentMonth = k.startsWith(currentMonthPrefix);
          const dayEvents = eventsByDay[k] || [];

          return (
            <div
              key={k}
              onClick={() => onSelectDate(k)}
              onDoubleClick={() => onNewEvent(k, 10)}
              data-testid={`day-cell-${k}`}
              className={`min-h-[92px] sm:min-h-[104px] rounded-xl p-1.5 sm:p-2 cursor-pointer transition-all duration-150 flex flex-col justify-between select-none ${
                isSelected
                  ? "bg-blue-50/80 border-2 border-[#007AFF] ring-2 ring-[#007AFF]/20 shadow-sm"
                  : isCurrentMonth
                  ? "bg-slate-50/70 hover:bg-slate-100/80 border border-slate-200/70 hover:border-slate-300"
                  : "bg-slate-50/30 border border-slate-100 text-slate-300 opacity-40"
              }`}
            >
              {/* Day Number Header */}
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-semibold leading-none ${
                    isSelected
                      ? "text-[#007AFF] font-extrabold text-sm"
                      : isToday
                      ? "px-1.5 py-0.5 rounded-full bg-[#007AFF] text-white font-bold text-[11px]"
                      : isCurrentMonth
                      ? "text-slate-700"
                      : "text-slate-400"
                  }`}
                >
                  {dayNum(k)}
                </span>
                {dayEvents.length > 0 && !isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#007AFF]" />
                )}
              </div>

              {/* Event Chips */}
              <div className="space-y-1 my-1 flex-1 overflow-hidden">
                {dayEvents.slice(0, 3).map((e) => {
                  const chipCls = getChipStyle(e);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onOpenEvent(e);
                      }}
                      className={`w-full text-left truncate rounded px-1.5 py-0.5 text-[10px] font-medium transition-transform active:scale-98 ${chipCls} ${
                        e.status === "Completed" ? "line-through opacity-60" : ""
                      }`}
                      title={`${e.title} (${e.activity_type})`}
                    >
                      {e.title}
                    </button>
                  );
                })}
                {dayEvents.length > 3 && (
                  <div className="text-[9px] font-semibold text-slate-500 px-1">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
