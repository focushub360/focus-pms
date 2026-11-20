import { useState } from "react";
import { api, errMsg } from "@/lib/api";
import { toast } from "sonner";

export default function ActualDialog({ item, onClose, onSaved }) {
  const [value, setValue] = useState(item.actual ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (value === "" || isNaN(Number(value))) return toast.error("Enter a numeric actual value");
    setBusy(true);
    try {
      await api.post(`/kpi/assignments/${item.assignment_id}/actual`, { actual_value: Number(value), note });
      toast.success("Actual recorded");
      onSaved();
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4" data-testid="actual-dialog">
      <form onSubmit={save} className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 border border-slate-200">
        <h3 className="text-lg font-bold" style={{ color: "#262262" }}>Update actual</h3>
        <p className="text-sm text-slate-500 mt-1">{item.kpi_name} <span className="text-slate-400">({item.unit})</span></p>
        <p className="text-xs text-slate-400 mt-1">{item.formula}</p>
        <label className="fe-kpi-label block mt-4">Actual value</label>
        <input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} className="fe-input mt-1" data-testid="actual-value-input" autoFocus />
        <label className="fe-kpi-label block mt-3">Note / evidence</label>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="fe-input mt-1" data-testid="actual-note-input" />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="fe-btn-secondary" onClick={onClose} data-testid="actual-cancel">Cancel</button>
          <button className="fe-btn-primary" disabled={busy} data-testid="actual-save">{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
