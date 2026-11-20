import { useState } from "react";
import { api, errMsg, fmtINR } from "@/lib/api";
import ReasonDialog from "@/components/dash/ReasonDialog";
import { toast } from "sonner";

const STALE_DAYS = 14;
const age = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0);

export default function KanbanBoard({ opps, users, stages, onMoved, onOpen }) {
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const [pending, setPending] = useState(null);

  const move = async (opp, stage, extra = {}) => {
    try { await api.post(`/opportunities/${opp.id}/stage`, { stage, ...extra }); toast.success(`Moved to ${stage}`); onMoved(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const drop = (stage) => {
    setOver(null);
    const opp = opps.find((o) => o.id === drag);
    setDrag(null);
    if (!opp || opp.stage === stage) return;
    if (stage === "Won" || stage === "Lost" || stage === "On Hold") return setPending({ opp, stage });
    move(opp, stage);
  };
  const name = (id) => users.find((u) => u.id === id)?.name?.split(" ")[0] || "—";

  return (
    <div className="flex gap-3 overflow-x-auto pb-3" data-testid="kanban-board">
      {stages.map((s) => {
        const list = opps.filter((o) => o.stage === s);
        const total = list.reduce((t, o) => t + Number(o.value_inr || 0), 0);
        return (
          <div key={s} onDragOver={(e) => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(null)} onDrop={() => drop(s)}
            className={`flex-shrink-0 w-64 rounded-lg border ${over === s ? "border-[#264494] bg-[#DCE4F7]" : "border-slate-200 bg-slate-50"}`} data-testid={`kanban-col-${s}`}>
            <div className="px-3 py-2 border-b border-slate-200">
              <div className="text-xs font-bold uppercase tracking-wider text-[#262262]">{s} <span className="text-slate-400">({list.length})</span></div>
              <div className="text-[11px] text-slate-500">{fmtINR(total)}</div>
            </div>
            <div className="p-2 space-y-2 min-h-[120px]">
              {list.map((o) => {
                const d = age(o.updated_at);
                const stale = !["Won", "Lost"].includes(s) && d >= STALE_DAYS;
                return (
                  <div key={o.id} draggable onDragStart={() => setDrag(o.id)} onClick={() => onOpen && onOpen(o)}
                    className="bg-white border border-slate-200 rounded-md p-2.5 cursor-grab hover:border-[#264494] text-sm" data-testid={`kanban-card-${o.id}`}>
                    <div className="font-semibold text-slate-800 leading-snug">{o.title}</div>
                    <div className="text-[11px] text-slate-500">{o.account_name}</div>
                    <div className="flex justify-between items-center mt-1.5 text-xs">
                      <b className="text-[#264494]">{fmtINR(o.value_inr)}</b><span className="text-slate-500">{name(o.primary_owner_id)}</span>
                    </div>
                    <div className="flex justify-between mt-1 text-[10px]">
                      <span className={stale ? "text-rose-600 font-semibold" : "text-slate-400"}>{stale ? `Inactive ${d}d` : `${d}d in stage`}</span>
                      {o.expected_close_date && <span className="text-slate-400">Close {o.expected_close_date.slice(0, 10)}</span>}
                    </div>
                    {o.po_reference && s === "Won" && <div className="text-[10px] text-emerald-700 mt-1">PO: {o.po_reference}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {pending && (
        <ReasonDialog
          title={pending.stage === "Won" ? `Mark Won · ${pending.opp.title}` : `Mark ${pending.stage} · ${pending.opp.title}`}
          label={pending.stage === "Won" ? "PO / signed agreement reference" : `Reason for ${pending.stage.toLowerCase()}`}
          confirmText={`Mark ${pending.stage}`} onCancel={() => setPending(null)}
          onConfirm={(v) => { const p = pending; setPending(null); move(p.opp, p.stage, p.stage === "Won" ? { po_reference: v } : { reason: v }); }} />
      )}
    </div>
  );
}
