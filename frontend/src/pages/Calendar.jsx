import React, { useCallback, useEffect, useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Calendar as CalIcon,
  Bell,
  Clock,
  Sparkles,
} from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import MonthGrid from "@/components/calendar/MonthGrid";
import DayAgendaTimeline from "@/components/calendar/DayAgendaTimeline";
import ActionChecklist from "@/components/calendar/ActionChecklist";
import { WeekView, DayView, AgendaView, YearView } from "@/components/calendar/Views";
import EventDialog from "@/components/calendar/EventDialog";
import { rangeFor, step, title, todayKey, keyOf } from "@/components/calendar/utils";
import { AUTOMOTIVE_PROTOTYPE_EVENTS, getRelativeDemoEvents } from "@/components/calendar/demoData";

const GOOGLE_VIEWS = ["month", "week", "day", "agenda"];

export default function CalendarPage() {
  const { user } = useAuth();

  // Google Calendar View Mode
  const [view, setView] = useState("month");

  // Default anchor & selected date: Default to Nov 14, 2026 to show prototype data, or current month
  const [anchor, setAnchor] = useState(() => {
    const t = todayKey();
    return t.startsWith("2026-11") ? t : "2026-11-14";
  });

  const [selectedDate, setSelectedDate] = useState(() => {
    const t = todayKey();
    return t.startsWith("2026-11") ? t : "2026-11-14";
  });

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [scope, setScope] = useState("mine");
  const [activityTypeFilter, setActivityTypeFilter] = useState("All");

  // Data states
  const [backendEvents, setBackendEvents] = useState([]);
  const [customTasks, setCustomTasks] = useState([]);
  const [submissionData, setSubmissionData] = useState({ latest: null, history: [] });
  const [submittingTasks, setSubmittingTasks] = useState(false);
  const [submitTaskError, setSubmitTaskError] = useState("");
  const [meta, setMeta] = useState(null);
  const [dlg, setDlg] = useState(null);

  // Load calendar metadata once
  useEffect(() => {
    api
      .get("/calendar/meta")
      .then((r) => setMeta(r.data))
      .catch(() => {
        setMeta({
          types: ["Appointment", "Task", "Meeting", "Customer Meeting", "Sales Call", "Follow-up"],
          statuses: ["Planned", "Completed", "Cancelled"],
          people: [],
        });
      });
  }, []);

  // Fetch events only when view, anchor, or scope changes
  const loadEvents = useCallback(() => {
    const [start, end] = rangeFor(view, anchor);
    api
      .get("/calendar/events", { params: { start, end, scope } })
      .then((r) => {
        setBackendEvents(r.data || []);
      })
      .catch(() => {
        setBackendEvents([]);
      });
  }, [view, anchor, scope]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const loadSubmissions = useCallback(() => {
    api
      .get("/calendar/tasks/submissions", { params: { date: selectedDate } })
      .then((r) => setSubmissionData({ latest: r.data?.latest || null, history: r.data?.history || [] }))
      .catch(() => setSubmissionData({ latest: null, history: [] }));
  }, [selectedDate]);

  useEffect(() => {
    setSubmitTaskError("");
    loadSubmissions();
  }, [loadSubmissions]);

  // Combine backend events + prototype events + custom items (memoized)
  const allEvents = useMemo(() => {
    const map = new Map();

    // 1. Prototype events from automotive operations demo
    AUTOMOTIVE_PROTOTYPE_EVENTS.forEach((e) => map.set(e.id, { ...e }));

    // 2. Fallback relative events if viewing outside Nov 2026
    const today = todayKey();
    if (!anchor.startsWith("2026-11")) {
      getRelativeDemoEvents(today).forEach((e) => map.set(e.id, { ...e }));
    }

    // 3. Backend events
    (backendEvents || []).forEach((e) => map.set(e.id, { ...e }));

    // 4. Custom tasks created locally
    customTasks.forEach((e) => map.set(e.id, { ...e }));

    return Array.from(map.values());
  }, [backendEvents, customTasks, anchor]);

  // Fast filtered events
  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const type = activityTypeFilter;

    if (!q && type === "All") return allEvents;

    return allEvents.filter((e) => {
      if (type !== "All" && e.activity_type !== type) return false;
      if (q) {
        const titleMatch = (e.title || "").toLowerCase().includes(q);
        const typeMatch = (e.activity_type || "").toLowerCase().includes(q);
        const notesMatch = (e.notes || "").toLowerCase().includes(q);
        const locMatch = (e.location || "").toLowerCase().includes(q);
        return titleMatch || typeMatch || notesMatch || locMatch;
      }
      return true;
    });
  }, [allEvents, activityTypeFilter, searchQuery]);

  // High-performance O(1) day lookup mapping (eliminates lag across all 42 calendar cells)
  const eventsByDay = useMemo(() => {
    const map = {};
    for (const e of filteredEvents) {
      const s = (e.start_at || "").slice(0, 10);
      const en = (e.end_at || s).slice(0, 10);
      if (!map[s]) map[s] = [];
      map[s].push(e);
      if (en !== s && !map[en]) {
        map[en] = [e];
      }
    }
    return map;
  }, [filteredEvents]);

  // Tasks for Action Checklist (right panel) — strictly scoped to selectedDate
  const checklistTasks = useMemo(() => {
    return filteredEvents
      .filter((e) => {
        const isTask = e.activity_type === "Task" || e.metric_target !== undefined;
        const eDate = e.calendar_date || keyOf(e.start_at);
        return isTask && eDate === selectedDate;
      })
      .sort((a, b) => {
        if (a.status === "Completed" && b.status !== "Completed") return 1;
        if (a.status !== "Completed" && b.status === "Completed") return -1;
        return (a.start_at || "").localeCompare(b.start_at || "");
      });
  }, [filteredEvents, selectedDate]);

  // Instant optimistic toggle
  const handleToggleComplete = useCallback((taskId, nextStatus) => {
    const updater = (prev) =>
      prev.map((item) => (item.id === taskId ? { ...item, status: nextStatus } : item));

    setBackendEvents(updater);
    setCustomTasks(updater);

    api.patch(`/calendar/events/${taskId}/task-progress`, { status: nextStatus }).catch(() => {});
    toast.success(nextStatus === "Completed" ? "Marked completed" : "Marked open");
  }, []);

  // Instant optimistic quantitative metric update
  const handleUpdateMetric = useCallback((taskId, currentVal, targetVal) => {
    const isNowCompleted = targetVal ? currentVal >= targetVal : false;
    const updater = (prev) =>
      prev.map((item) =>
        item.id === taskId
          ? {
              ...item,
              metric_current: currentVal,
              status: isNowCompleted ? "Completed" : item.status,
            }
          : item
      );

    setBackendEvents(updater);
    setCustomTasks(updater);

    api.patch(`/calendar/events/${taskId}/task-progress`, {
      metric_current: currentVal,
      status: isNowCompleted ? "Completed" : undefined,
    }).catch(() => {});
  }, []);

  // Persist new checklist task to backend with defined timeframe (due date + due time)
  const handleAddChecklistTask = useCallback(async (taskData) => {
    const dueDate = taskData.due_date || selectedDate;
    const dueTime = taskData.due_time || "";
    const endDate = dueDate >= selectedDate ? dueDate : selectedDate;
    const tempId = `task-${Date.now()}`;
    const newTask = {
      id: tempId,
      title: taskData.title,
      activity_type: "Task",
      priority: taskData.priority || "High",
      calendar_date: selectedDate,
      due_date: dueDate,
      due_time: dueTime,
      timeframe: taskData.timeframe || (dueTime ? `${dueDate} ${dueTime}` : ""),
      metric_target: taskData.metric_target,
      metric_current: taskData.metric_current,
      start_at: `${selectedDate}T${dueTime || "17:00"}:00+05:30`,
      end_at: `${endDate}T${dueTime || "17:00"}:00+05:30`,
      all_day: false,
      status: "Planned",
      visibility: "PRIVATE",
    };

    setCustomTasks((prev) => [newTask, ...prev]);
    try {
      const r = await api.post("/calendar/events", newTask);
      if (r.data?.id) {
        setCustomTasks((prev) => prev.filter((x) => x.id !== tempId));
        setBackendEvents((prev) => [r.data, ...prev]);
      }
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, [selectedDate]);

  const handleSubmitTaskProgress = useCallback(async (tasksPayload) => {
    setSubmittingTasks(true);
    setSubmitTaskError("");
    try {
      const r = await api.post("/calendar/tasks/submit", {
        date: selectedDate,
        tasks: tasksPayload,
      });
      setSubmissionData({ latest: r.data.latest, history: r.data.history || [] });
      toast.success(
        `Submitted ${r.data.latest.completed_tasks}/${r.data.latest.total_tasks} tasks (${r.data.latest.completion_pct}%)`
      );
    } catch (e) {
      const msg = errMsg(e);
      setSubmitTaskError(msg);
      toast.error(msg);
    } finally {
      setSubmittingTasks(false);
    }
  }, [selectedDate]);

  // Fast date selection
  const handleSelectDate = useCallback((dateKey) => {
    setSelectedDate(dateKey);
  }, []);

  // Stepping
  const handleStep = useCallback((direction) => {
    const nextAnchor = step(view, anchor, direction);
    setAnchor(nextAnchor);
    if (view === "month") {
      const dayNumStr = selectedDate.slice(8);
      setSelectedDate(`${nextAnchor.slice(0, 7)}-${dayNumStr}`);
    } else {
      setSelectedDate(nextAnchor);
    }
  }, [view, anchor, selectedDate]);

  const handleToday = useCallback(() => {
    const t = todayKey();
    setAnchor(t);
    setSelectedDate(t);
  }, []);

  const sharedViewProps = {
    anchor,
    events: filteredEvents,
    onOpen: (e) => setDlg({ event: e }),
    onNew: (day, hour) => setDlg({ day: day || selectedDate, hour: hour || 10 }),
  };

  return (
    <div className="space-y-5" data-testid="calendar-page">
      {/* ────────────────── STANDARDIZED PAGE HEADER ────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#262262] via-[#264494] to-[#4F46E5] bg-clip-text text-transparent">
            Calendar &amp; Activities
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">
            Meetings, appointments, customer calls, follow-ups, and action checklists.
          </p>
        </div>
        <button
          onClick={() => setDlg({ day: selectedDate, hour: 10 })}
          className="fe-btn-primary shrink-0 self-start sm:self-auto"
          data-testid="cal-new"
        >
          <Plus size={16} />
          <span>New activity</span>
        </button>
      </div>

      {/* ────────────────── STANDARDIZED TOP CONTROLS & NAVIGATION BAR ────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        {/* Left: Search input */}
        <div className="w-full lg:w-80 relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search activities, people, leads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-7 py-1.5 rounded-xl text-xs sm:text-sm border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-[#007AFF] outline-none transition-all"
            data-testid="cal-search-input"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
            >
              ×
            </button>
          )}
        </div>

        {/* Right: Scope, Category, Google Calendar View, Stepper */}
        <div className="flex flex-wrap items-center gap-2.5 justify-between lg:justify-end">
          {/* Scope Dropdown */}
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="fe-input py-1.5 text-xs sm:text-sm w-auto"
            data-testid="cal-scope-select"
          >
            <option value="mine">Individual Employee</option>
            <option value="team">Department / Team</option>
          </select>

          {/* Activity Category Filter */}
          <select
            value={activityTypeFilter}
            onChange={(e) => setActivityTypeFilter(e.target.value)}
            className="fe-input py-1.5 text-xs sm:text-sm w-auto"
            data-testid="cal-type-select"
          >
            <option value="All">All Types</option>
            <option value="Appointment">Appointments</option>
            <option value="Task">Tasks</option>
            <option value="Follow-up">Follow-ups</option>
            <option value="Customer Meeting">Customer Meets</option>
            <option value="Sales Call">Sales Calls</option>
            <option value="Meeting">Meetings</option>
          </select>

          {/* Google Calendar View Switcher (iOS Segmented Control) */}
          <div
            className="p-1 bg-slate-200/60 backdrop-blur-md rounded-2xl inline-flex gap-1 border border-slate-200/80 shadow-inner"
            data-testid="cal-views"
          >
            {GOOGLE_VIEWS.map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 text-xs font-semibold rounded-xl capitalize transition-all duration-200 shrink-0 whitespace-nowrap active:scale-95 ${
                  view === v
                    ? "bg-white text-[#262262] shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/40"
                }`}
                data-testid={`cal-view-${v}`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Stepper Navigation: Today, <, >, Month/Year Title */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleToday}
              className="fe-btn-secondary text-xs px-3 py-1.5"
              data-testid="cal-today-btn"
            >
              Today
            </button>
            <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              <button
                onClick={() => handleStep(-1)}
                className="p-1.5 hover:bg-slate-50 text-slate-600"
                title="Previous"
                data-testid="cal-prev"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => handleStep(1)}
                className="p-1.5 border-l border-slate-200 hover:bg-slate-50 text-slate-600"
                title="Next"
                data-testid="cal-next"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <span className="text-xs sm:text-sm font-bold text-[#262262] ml-1 whitespace-nowrap">
              {title(view, anchor)}
            </span>
          </div>
        </div>
      </div>

      {/* ────────────────── MAIN 2-COLUMN LAYOUT ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ── LEFT COLUMN (~74% width: Month Grid + Day Agenda Timeline) ── */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-5">
          {view === "month" && (
            <>
              {/* 1. Month Calendar Grid (Top) */}
              <MonthGrid
                anchor={anchor}
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
                eventsByDay={eventsByDay}
                onOpenEvent={(e) => setDlg({ event: e })}
                onNewEvent={(day, hour) => setDlg({ day, hour })}
              />

              {/* 2. Selected Day Agenda Timeline (Bottom) */}
              <DayAgendaTimeline
                selectedDate={selectedDate}
                events={filteredEvents}
                onOpenEvent={(e) => setDlg({ event: e })}
                onNewEvent={(day, hour) => setDlg({ day, hour })}
              />
            </>
          )}

          {view === "week" && <WeekView {...sharedViewProps} />}
          {view === "day" && <DayView {...sharedViewProps} />}
          {view === "agenda" && <AgendaView {...sharedViewProps} />}
          {view === "year" && (
            <YearView
              {...sharedViewProps}
              onPick={(k) => {
                setAnchor(k);
                setSelectedDate(k);
                setView("day");
              }}
            />
          )}
        </div>

        {/* ── RIGHT COLUMN (~26% width: Tasks & Action Checklist) ── */}
        <div className="lg:col-span-4 xl:col-span-3">
          <div className="sticky top-20">
            <ActionChecklist
              tasks={checklistTasks}
              selectedDate={selectedDate}
              submissionData={submissionData}
              submitting={submittingTasks}
              submitError={submitTaskError}
              onToggleComplete={handleToggleComplete}
              onUpdateMetric={handleUpdateMetric}
              onAddTask={handleAddChecklistTask}
              onSubmitProgress={handleSubmitTaskProgress}
            />
          </div>
        </div>
      </div>

      {/* Activity Create / Edit Dialog */}
      {dlg && (
        <EventDialog
          {...dlg}
          meta={meta || { types: [], statuses: [], people: [] }}
          onClose={() => setDlg(null)}
          onSaved={() => {
            setDlg(null);
            loadEvents();
          }}
        />
      )}
    </div>
  );
}
