import { useState, useRef } from "react";
import { api, errMsg, fmtINR } from "@/lib/api";
import ReasonDialog from "@/components/dash/ReasonDialog";
import { toast } from "sonner";

const STALE_DAYS = 14;
const age = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0);

export default function KanbanBoard({ opps, users, stages, onMoved, onOpen }) {
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const [pending, setPending] = useState(null);
  const [activeStageFilter, setActiveStageFilter] = useState("all");
  const scrollRef = useRef(null);

  const move = async (opp, stage, extra = {}) => {
    try {
      await api.post(`/opportunities/${opp.id}/stage`, { stage, ...extra });
      toast.success(`Moved to ${stage}`);
      onMoved();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const drop = (stage) => {
    setOver(null);
    const opp = opps.find((o) => o.id === drag);
    setDrag(null);
    if (!opp || opp.stage === stage) return;
    if (stage === "Won" || stage === "Lost" || stage === "On Hold") {
      return setPending({ opp, stage });
    }
    move(opp, stage);
  };

  const name = (id) => users.find((u) => u.id === id)?.name?.split(" ")[0] || "—";

  const displayedStages =
    activeStageFilter === "all" ? stages : stages.filter((s) => s === activeStageFilter);

  return (
    <div className="space-y-3">
      {/* Mobile/Tablet Stage Filter Pills */}
      <div className="flex lg:hidden gap-1.5 overflow-x-auto fe-scroll pb-1.5 -mx-1 px-1">
        <button
          onClick={() => setActiveStageFilter("all")}
          className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
            activeStageFilter === "all"
              ? "bg-[#264494] text-white shadow-xs"
              : "bg-white text-slate-600 border border-slate-200"
          }`}
        >
          All Stages ({opps.length})
        </button>
        {stages.map((s) => {
          const count = opps.filter((o) => o.stage === s).length;
          return (
            <button
              key={s}
              onClick={() => setActiveStageFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                activeStageFilter === s
                  ? "bg-[#264494] text-white shadow-xs"
                  : "bg-white text-slate-600 border border-slate-200"
              }`}
            >
              {s} {count > 0 && `(${count})`}
            </button>
          );
        })}
      </div>

      {/* Kanban Board Horizontal Track */}
      <div
        ref={scrollRef}
        className="flex gap-3.5 overflow-x-auto pb-4 fe-scroll snap-x"
        data-testid="kanban-board"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {displayedStages.map((s) => {
          const list = opps.filter((o) => o.stage === s);
          const total = list.reduce((t, o) => t + Number(o.value_inr || 0), 0);
          return (
            <div
              key={s}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(s);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={() => drop(s)}
              className={`shrink-0 w-72 sm:w-80 rounded-xl border snap-start transition-colors ${
                over === s ? "border-[#264494] bg-[#DCE4F7]/50" : "border-slate-200/90 bg-slate-50/70"
              }`}
              data-testid={`kanban-col-${s}`}
            >
              <div className="px-3.5 py-2.5 border-b border-slate-200/80 bg-white/70 rounded-t-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-[#262262]">
                    {s} <span className="text-slate-400 font-normal">({list.length})</span>
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500 mt-0.5">{fmtINR(total)}</div>
                </div>
                {list.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-[#264494]/60" />
                )}
              </div>

              <div className="p-2.5 space-y-2.5 min-h-[140px] max-h-[calc(100vh-280px)] overflow-y-auto fe-scroll">
                {list.map((o) => {
                  const d = age(o.updated_at);
                  const stale = !["Won", "Lost"].includes(s) && d >= STALE_DAYS;
                  return (
                    <div
                      key={o.id}
                      draggable
                      onDragStart={() => setDrag(o.id)}
                      onClick={() => onOpen && onOpen(o)}
                      className="bg-white border border-slate-200 rounded-xl p-3 cursor-grab hover:border-[#264494] hover:shadow-sm text-sm transition-all active:cursor-grabbing"
                      data-testid={`kanban-card-${o.id}`}
                    >
                      <div className="font-semibold text-slate-800 leading-snug">{o.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{o.account_name}</div>
                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100 text-xs">
                        <b className="text-[#264494] font-bold">{fmtINR(o.value_inr)}</b>
                        <span className="text-slate-500 font-medium">{name(o.primary_owner_id)}</span>
                      </div>
                      <div className="flex justify-between items-center mt-1.5 text-[10px]">
                        <span className={stale ? "text-rose-600 font-semibold" : "text-slate-400"}>
                          {stale ? `Inactive ${d}d` : `${d}d in stage`}
                        </span>
                        {o.expected_close_date && (
                          <span className="text-slate-400">Close {o.expected_close_date.slice(0, 10)}</span>
                        )}
                      </div>
                      {o.po_reference && s === "Won" && (
                        <div className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded mt-1.5 font-medium truncate">
                          PO: {o.po_reference}
                        </div>
                      )}
                    </div>
                  );
                })}

                {list.length === 0 && (
                  <div className="h-28 flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                    No items in {s}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {pending && (
        <ReasonDialog
          title={
            pending.stage === "Won"
              ? `Mark Won · ${pending.opp.title}`
              : `Mark ${pending.stage} · ${pending.opp.title}`
          }
          label={
            pending.stage === "Won"
              ? "PO / signed agreement reference"
              : `Reason for ${pending.stage.toLowerCase()}`
          }
          confirmText={`Mark ${pending.stage}`}
          onCancel={() => setPending(null)}
          onConfirm={(v) => {
            const p = pending;
            setPending(null);
            move(p.opp, p.stage, p.stage === "Won" ? { po_reference: v } : { reason: v });
          }}
        />
      )}
    </div>
  );
}
