import React, { useState } from "react";
import { Check, CheckSquare, Plus, Clock } from "lucide-react";
import { toast } from "sonner";
import { timeOf } from "./utils";

export default function ActionChecklist({
  tasks = [],
  selectedDate,
  onToggleComplete,
  onUpdateMetric,
  onAddTask,
}) {
  const [editingId, setEditingId] = useState(null);
  const [metricValue, setMetricValue] = useState(0);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState("High");
  const [newTarget, setNewTarget] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const startEdit = (t) => {
    setEditingId(t.id);
    setMetricValue(t.metric_current ?? 0);
  };

  const saveEdit = (t) => {
    const val = Number(metricValue) || 0;
    onUpdateMetric(t.id, val, t.metric_target);
    setEditingId(null);
    if (t.metric_target && val >= t.metric_target) {
      toast.success(`Target achieved! (${val}/${t.metric_target})`);
    } else {
      toast.success(`Progress updated to ${val}${t.metric_target ? `/${t.metric_target}` : ""}`);
    }
  };

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAddTask({
      title: newTitle.trim(),
      priority: newPriority,
      metric_target: newTarget ? Number(newTarget) : null,
      metric_current: newTarget ? 0 : null,
      due_time: "17:00",
      activity_type: "Task",
    });
    setNewTitle("");
    setNewTarget("");
    setIsAdding(false);
    toast.success("Task added to action checklist");
  };

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col h-full"
      data-testid="action-checklist-panel"
    >
      {/* Panel Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckSquare size={18} className="text-[#007AFF]" />
          <h3 className="font-bold text-sm text-[#262262] tracking-wide">Tasks &amp; Action Checklist</h3>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="fe-btn-secondary text-xs px-2.5 py-1"
          title="Add task"
        >
          <Plus size={14} />
          <span className="text-[11px]">Add</span>
        </button>
      </div>

      {/* Quick Add Form */}
      {isAdding && (
        <form onSubmit={handleCreate} className="p-3 border-b border-slate-100 bg-slate-50/70 space-y-2">
          <input
            type="text"
            placeholder="Task description (e.g. Call 10 prospects)..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 outline-none focus:border-[#007AFF]"
            autoFocus
          />
          <div className="flex items-center gap-2 text-xs">
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value)}
              className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 text-[11px]"
            >
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <input
              type="number"
              placeholder="Target (e.g. 15)"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              className="w-24 px-2 py-1 text-[11px] rounded-lg border border-slate-300 bg-white text-slate-900"
            />
            <button
              type="submit"
              className="ml-auto px-3 py-1 rounded-lg bg-[#007AFF] hover:bg-blue-600 text-white font-semibold text-[11px] transition-all"
            >
              Save
            </button>
          </div>
        </form>
      )}

      {/* Task List */}
      <div className="flex-1 p-3 space-y-2.5 overflow-y-auto fe-scroll max-h-[620px]">
        {tasks.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            No action items for this day. Click "+ Add" to create one.
          </div>
        ) : (
          tasks.map((t) => {
            const isCompleted = t.status === "Completed";
            const isEditing = editingId === t.id;
            const hasMetric = t.metric_target !== null && t.metric_target !== undefined;
            const current = t.metric_current ?? 0;
            const target = t.metric_target;

            // Priority badge styling
            const priorityBadge = (priority) => {
              if (priority === "High") {
                return (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                    High
                  </span>
                );
              }
              if (priority === "Medium") {
                return (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    Medium
                  </span>
                );
              }
              return (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
                  Low
                </span>
              );
            };

            return (
              <div
                key={t.id}
                className={`p-3 rounded-xl border transition-all ${
                  isCompleted
                    ? "bg-slate-50/80 border-slate-200 opacity-60"
                    : "bg-white border-slate-200/90 hover:border-slate-300 shadow-2xs"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() => onToggleComplete(t.id, isCompleted ? "Planned" : "Completed")}
                    className={`mt-0.5 shrink-0 w-4 h-4 rounded flex items-center justify-center border transition-all cursor-pointer ${
                      isCompleted
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "border-slate-400 hover:border-[#007AFF] bg-white"
                    }`}
                    title={isCompleted ? "Mark incomplete" : "Mark completed"}
                  >
                    {isCompleted && <Check size={12} strokeWidth={3} />}
                  </button>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-semibold leading-snug break-words ${
                        isCompleted ? "line-through text-slate-400" : "text-slate-900"
                      }`}
                    >
                      {t.title}
                    </p>

                    {/* Metadata: Due Time & Priority */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Clock size={11} className="text-slate-400" />
                        Due {t.due_time || (t.start_at ? timeOf(t.start_at) : "5:00 PM")}
                      </span>
                      {priorityBadge(t.priority || "High")}
                    </div>

                    {/* Quantitative Progress Pill or Status */}
                    <div className="mt-2.5">
                      {hasMetric ? (
                        isEditing ? (
                          <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                            <button
                              type="button"
                              onClick={() => setMetricValue(Math.max(0, Number(metricValue) - 1))}
                              className="w-6 h-6 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold flex items-center justify-center text-xs"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              value={metricValue}
                              onChange={(e) => setMetricValue(e.target.value)}
                              className="w-12 text-center text-xs bg-white text-emerald-700 font-bold rounded py-0.5 border border-slate-300"
                            />
                            <span className="text-xs text-slate-500">/ {target}</span>
                            <button
                              type="button"
                              onClick={() => setMetricValue(Number(metricValue) + 1)}
                              className="w-6 h-6 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold flex items-center justify-center text-xs"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              onClick={() => saveEdit(t)}
                              className="ml-auto px-2 py-0.5 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEdit(t)}
                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 ${
                              isCompleted || current >= target
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200 active:scale-98"
                            }`}
                            title="Click to update actual count"
                          >
                            <span>
                              {current}/{target} – tap to update
                            </span>
                          </button>
                        )
                      ) : (
                        <span className="text-[11px] font-medium text-slate-500">
                          {isCompleted ? "Completed" : "Open"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Disclaimer (Exact copy from prototype screenshot) */}
      <div className="p-3.5 border-t border-slate-100 bg-slate-50/60 text-[11px] leading-relaxed text-slate-500 rounded-b-2xl">
        <p className="italic">
          Rule: ticking a task never marks a KPI achieved. Quantitative tasks need an actual-achievement update.
        </p>
      </div>
    </div>
  );
}
