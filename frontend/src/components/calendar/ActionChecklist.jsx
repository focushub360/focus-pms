import React, { useMemo, useState } from "react";
import { Check, CheckSquare, Plus, Clock, Send, History, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { timeOf } from "./utils";

export function getTaskTimeframe(t) {
  if ((t.due_time || "").trim()) return t.due_time.trim();
  if ((t.timeframe || "").trim()) return t.timeframe.trim();
  if (!t.all_day && t.start_at) return timeOf(t.start_at);
  return "";
}

export default function ActionChecklist({
  tasks = [],
  selectedDate,
  submissionData = { latest: null, history: [] },
  submitting = false,
  submitError = "",
  onToggleComplete,
  onUpdateMetric,
  onAddTask,
  onSubmitProgress,
}) {
  const [editingId, setEditingId] = useState(null);
  const [metricValue, setMetricValue] = useState(0);
  const [newTitle, setNewTitle] = useState("");
  const [newDueTime, setNewDueTime] = useState("");
  const [newPriority, setNewPriority] = useState("High");
  const [newTarget, setNewTarget] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const validTasks = useMemo(() => tasks.filter((t) => Boolean(getTaskTimeframe(t))), [tasks]);
  const checkedCount = useMemo(
    () => validTasks.filter((t) => t.status === "Completed").length,
    [validTasks]
  );

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
    setFormErr("");
    if (!newTitle.trim()) {
      setFormErr("Task description is required.");
      return;
    }
    if (!newDueTime.trim()) {
      setFormErr("A timeframe (due time) is required for submission eligibility.");
      return;
    }
    onAddTask({
      title: newTitle.trim(),
      priority: newPriority,
      metric_target: newTarget ? Number(newTarget) : null,
      metric_current: newTarget ? 0 : null,
      due_time: newDueTime.trim(),
      timeframe: `${selectedDate} ${newDueTime.trim()}`,
      activity_type: "Task",
    });
    setNewTitle("");
    setNewDueTime("");
    setNewTarget("");
    setFormErr("");
    setIsAdding(false);
    toast.success("Task added to action checklist");
  };

  const handleSubmit = () => {
    if (validTasks.length === 0 || submitting) return;
    onSubmitProgress(
      validTasks.map((t) => ({
        task_id: t.id,
        description: t.title,
        timeframe: getTaskTimeframe(t),
        priority: t.priority || "Normal",
        completed: t.status === "Completed",
      }))
    );
  };

  const latest = submissionData?.latest;
  const history = submissionData?.history || [];

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col h-full"
      data-testid="action-checklist-panel"
    >
      {/* Panel Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <CheckSquare size={18} className="text-[#007AFF] shrink-0" />
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-[#262262] tracking-wide truncate">Tasks &amp; Action Checklist</h3>
            <div className="text-[10px] text-slate-400 font-medium">{selectedDate}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsAdding(!isAdding);
            setFormErr("");
          }}
          className="fe-btn-secondary text-xs px-2.5 py-1"
          title="Add task"
          data-testid="checklist-add-btn"
        >
          <Plus size={14} />
          <span className="text-[11px]">Add</span>
        </button>
      </div>

      {/* Quick Add Form */}
      {isAdding && (
        <form onSubmit={handleCreate} className="p-3 border-b border-slate-100 bg-slate-50/70 space-y-2" data-testid="checklist-add-form">
          <input
            type="text"
            placeholder="Task description (e.g. Call 10 prospects)..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 outline-none focus:border-[#007AFF]"
            data-testid="checklist-new-title"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">Timeframe *</label>
              <input
                type="time"
                value={newDueTime}
                onChange={(e) => setNewDueTime(e.target.value)}
                className="w-full px-2 py-1 text-[11px] rounded-lg border border-slate-300 bg-white text-slate-900"
                data-testid="checklist-new-time"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">Priority</label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value)}
                className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 text-[11px]"
                data-testid="checklist-new-priority"
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <input
              type="number"
              min="1"
              placeholder="Target count (optional)"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              className="flex-1 px-2 py-1 text-[11px] rounded-lg border border-slate-300 bg-white text-slate-900"
            />
            <button
              type="submit"
              className="px-3 py-1 rounded-lg bg-[#007AFF] hover:bg-blue-600 text-white font-semibold text-[11px] transition-all cursor-pointer"
              data-testid="checklist-save-task"
            >
              Save
            </button>
          </div>
          {formErr && (
            <div className="text-[11px] text-rose-600 font-semibold flex items-center gap-1" data-testid="checklist-form-error">
              <AlertCircle size={12} /> {formErr}
            </div>
          )}
        </form>
      )}

      {/* Task List */}
      <div className="flex-1 p-3 space-y-2.5 overflow-y-auto fe-scroll max-h-[480px]">
        {tasks.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            No action items for {selectedDate}. Click "+ Add" to plan a task with a timeframe.
          </div>
        ) : (
          tasks.map((t) => {
            const isCompleted = t.status === "Completed";
            const isEditing = editingId === t.id;
            const hasMetric = t.metric_target !== null && t.metric_target !== undefined;
            const current = t.metric_current ?? 0;
            const target = t.metric_target;
            const tf = getTaskTimeframe(t);
            const hasTf = Boolean(tf);

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
                data-testid={`checklist-task-${t.id}`}
                className={`p-3 rounded-xl border transition-all ${
                  isCompleted
                    ? "bg-slate-50/80 border-slate-200 opacity-75"
                    : "bg-white border-slate-200/90 hover:border-slate-300 shadow-2xs"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    onClick={() => onToggleComplete(t.id, isCompleted ? "Planned" : "Completed")}
                    className={`mt-0.5 shrink-0 w-4 h-4 rounded flex items-center justify-center border transition-all cursor-pointer ${
                      isCompleted
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "border-slate-400 hover:border-[#007AFF] bg-white"
                    }`}
                    title={isCompleted ? "Mark incomplete" : "Mark completed"}
                    data-testid={`checklist-checkbox-${t.id}`}
                  >
                    {isCompleted && <Check size={12} strokeWidth={3} />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-semibold leading-snug break-words ${
                        isCompleted ? "line-through text-slate-400" : "text-slate-900"
                      }`}
                    >
                      {t.title}
                    </p>

                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {hasTf ? (
                        <span className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Clock size={11} className="text-slate-400" />
                          Due {tf}
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          No timeframe (excluded)
                        </span>
                      )}
                      {priorityBadge(t.priority || "Normal")}
                    </div>

                    <div className="mt-2">
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
                            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200 transition-all flex items-center gap-1.5"
                            title="Click to update actual count"
                          >
                            <span>{current}/{target} – tap to update</span>
                          </button>
                        )
                      ) : (
                        <span className={`text-[11px] font-medium ${isCompleted ? "text-emerald-600" : "text-slate-500"}`}>
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

      {/* Submission Progress Summary & Submit Action */}
      <div className="p-3.5 border-t border-slate-100 space-y-3 bg-slate-50/50">
        {submitError && (
          <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-[11px] text-rose-700 font-medium flex items-start gap-1.5" data-testid="checklist-submit-error">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        {latest && (
          <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2 shadow-2xs" data-testid="checklist-progress-summary">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                <CheckCircle2 size={12} /> Latest Submission
              </span>
              <span className="text-xs font-extrabold text-[#262262]" data-testid="checklist-completion-pct">
                {latest.completion_pct}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#264494] to-[#10B981] transition-all duration-500"
                style={{ width: `${Math.min(latest.completion_pct || 0, 100)}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
              <div className="bg-slate-50 rounded-lg py-1 px-1">
                <div className="text-slate-400 font-semibold">Total</div>
                <div className="font-bold text-slate-800" data-testid="checklist-total-count">{latest.total_tasks}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg py-1 px-1">
                <div className="text-emerald-600 font-semibold">Completed</div>
                <div className="font-bold text-emerald-700" data-testid="checklist-completed-count">{latest.completed_tasks}</div>
              </div>
              <div className="bg-amber-50 rounded-lg py-1 px-1">
                <div className="text-amber-600 font-semibold">Uncleared</div>
                <div className="font-bold text-amber-700" data-testid="checklist-uncleared-count">{latest.uncleared_tasks}</div>
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
              <span>Submitted {new Date(latest.submitted_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
              {history.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="inline-flex items-center gap-1 text-[#264494] font-semibold hover:underline cursor-pointer"
                  data-testid="checklist-history-toggle"
                >
                  <History size={11} /> History ({history.length})
                </button>
              )}
            </div>
            {showHistory && history.length > 1 && (
              <div className="pt-2 border-t border-slate-100 space-y-1 max-h-28 overflow-y-auto fe-scroll" data-testid="checklist-history-list">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between text-[10px] text-slate-600">
                    <span>{new Date(h.submitted_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                    <span>{h.completed_tasks}/{h.total_tasks} ({h.completion_pct}%)</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>
            Ready: <b className="text-slate-800">{validTasks.length}</b> valid ·{" "}
            <b className="text-emerald-700">{checkedCount}</b> checked
          </span>
          {validTasks.length > 0 && (
            <span className="font-semibold text-[#264494]">
              {Math.round((checkedCount / validTasks.length) * 100)}%
            </span>
          )}
        </div>

        <button
          type="button"
          disabled={validTasks.length === 0 || submitting}
          onClick={handleSubmit}
          data-testid="checklist-submit-btn"
          className="fe-btn-primary w-full !py-2 !text-xs disabled:opacity-45 disabled:cursor-not-allowed"
          title={validTasks.length === 0 ? "Add at least one task with a timeframe to submit" : "Submit daily task progress"}
        >
          <Send size={13} />
          {submitting ? "Submitting Progress…" : "Submit Progress"}
        </button>

        <p className="italic text-[11px] leading-relaxed text-slate-500">
          Rule: ticking a task never marks a KPI achieved. Task progress is tracked separately from KPI actuals.
        </p>
      </div>
    </div>
  );
}
