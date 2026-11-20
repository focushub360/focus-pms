import { useState } from "react";
import { api, errMsg } from "@/lib/api";
import { toast } from "sonner";

export default function ConvertLead({ lead, onDone }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ opportunity_title: `${lead.company} – ${lead.name}`, value_inr: 0, expected_close_date: "", service_category: "" });
  if (lead.related_opportunity_id) return <span className="fe-chip fe-chip-green">Converted</span>;
  if (["Disqualified", "Lost"].includes(lead.status)) return null;
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/leads/${lead.id}/convert`, { ...f, value_inr: Number(f.value_inr || 0), expected_close_date: f.expected_close_date || null });
      toast.success("Converted: account linked and opportunity created");
      setOpen(false); onDone();
    } catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <>
      <button className="text-xs text-[#264494] hover:underline" onClick={() => setOpen(true)} data-testid={`convert-lead-${lead.id}`}>Convert</button>
      {open && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
          <form onSubmit={save} className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 border border-slate-200 text-left" data-testid="convert-lead-dialog">
            <h3 className="text-lg font-bold text-[#262262]">Convert lead</h3>
            <p className="text-xs text-slate-500 mt-1">Links to existing account “{lead.company}” or creates it, then creates a Qualified opportunity owned by the lead owner.</p>
            <label className="fe-kpi-label block mt-4">Opportunity name</label>
            <input required className="fe-input mt-1" value={f.opportunity_title} onChange={(e) => setF({ ...f, opportunity_title: e.target.value })} data-testid="convert-title" />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div><label className="fe-kpi-label">Value (INR)</label><input type="number" min="0" className="fe-input mt-1" value={f.value_inr} onChange={(e) => setF({ ...f, value_inr: e.target.value })} data-testid="convert-value" /></div>
              <div><label className="fe-kpi-label">Expected close</label><input type="date" className="fe-input mt-1" value={f.expected_close_date} onChange={(e) => setF({ ...f, expected_close_date: e.target.value })} /></div>
            </div>
            <label className="fe-kpi-label block mt-3">Service / product category</label>
            <input className="fe-input mt-1" value={f.service_category} onChange={(e) => setF({ ...f, service_category: e.target.value })} />
            <div className="mt-5 flex justify-end gap-2"><button type="button" className="fe-btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="fe-btn-primary" data-testid="convert-submit">Convert</button></div>
          </form>
        </div>
      )}
    </>
  );
}
