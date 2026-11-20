import { useState } from "react";

export default function ReasonDialog({ title, label = "Reason", confirmText = "Confirm", onCancel, onConfirm }) {
  const [reason, setReason] = useState("");
  const submit = (e) => { e.preventDefault(); if (reason.trim().length >= 3) onConfirm(reason.trim()); };
  return (
    <div className="fixed inset-0 bg-slate-900/40 z-[60] flex items-center justify-center p-4" data-testid="reason-dialog">
      <form onSubmit={submit} className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 border border-slate-200">
        <h3 className="text-lg font-bold text-[#262262]">{title}</h3>
        <label className="fe-kpi-label block mt-4">{label} *</label>
        <textarea rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} className="fe-input mt-1" data-testid="reason-input" />
        <div className="text-[11px] text-slate-400 mt-1">Minimum 3 characters. Recorded in the audit log.</div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="fe-btn-secondary" onClick={onCancel} data-testid="reason-cancel">Cancel</button>
          <button className="fe-btn-primary" disabled={reason.trim().length < 3} data-testid="reason-confirm">{confirmText}</button>
        </div>
      </form>
    </div>
  );
}
