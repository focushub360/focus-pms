import { useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { toast } from "sonner";

const CHIP = { VALID: "fe-chip-green", IMPORTED: "fe-chip-green", DUPLICATE: "fe-chip-orange", ERROR: "fe-chip-red" };

const download = async (url, name) => {
  try {
    const r = await api.get(url, { responseType: "blob" });
    const u = URL.createObjectURL(r.data); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u);
  } catch (e) { toast.error(errMsg(e)); }
};

function History({ entity }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/imports", { params: { entity } }).then((r) => setRows(r.data)).catch(() => {}); }, [entity]);
  return (
    <table className="fe-table text-sm" data-testid="import-history"><thead><tr><th>Date</th><th>File</th><th>By</th><th>Status</th><th>Imported</th><th>Dup / Errors</th><th /></tr></thead>
      <tbody>{rows.map((i) => (
        <tr key={i.id}><td className="text-xs">{new Date(i.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td><td>{i.file_name}</td><td>{i.user_name}</td><td>{i.status}</td>
          <td>{i.summary.IMPORTED}</td><td>{i.summary.DUPLICATE} / {i.summary.ERROR}</td>
          <td>{(i.summary.DUPLICATE + i.summary.ERROR) > 0 && <button className="text-xs text-[#264494] hover:underline" onClick={() => download(`/imports/${i.id}/errors`, `import_errors_${i.id.slice(0, 8)}.csv`)}>Error report</button>}</td></tr>))}
        {!rows.length && <tr><td colSpan={7} className="text-slate-400 text-center py-4">No imports yet</td></tr>}</tbody></table>
  );
}

export default function ImportDialog({ entity, onClose, onDone }) {
  const [tab, setTab] = useState("upload");
  const [file, setFile] = useState(null);
  const [prev, setPrev] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [result, setResult] = useState(null);
  const run = async (m) => {
    if (!file) return toast.error("Choose a CSV or Excel file");
    const fd = new FormData(); fd.append("file", file); if (m) fd.append("mapping", JSON.stringify(m));
    try { const r = await api.post(`/imports/preview/${entity}`, fd); setPrev(r.data); setMapping(r.data.mapping); setResult(null); } catch (e) { toast.error(errMsg(e)); }
  };
  const confirm = async () => {
    try { const r = await api.post(`/imports/${prev.id}/confirm`); setResult(r.data); toast.success(`${r.data.summary.IMPORTED} record(s) imported`); onDone(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl p-6 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="import-dialog">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-lg font-bold text-[#262262] capitalize">Bulk import {entity}</h3>
          {["upload", "history"].map((t) => <button key={t} onClick={() => setTab(t)} className={`text-sm px-3 py-1 rounded capitalize ${tab === t ? "bg-[#264494] text-white" : "text-slate-600"}`} data-testid={`import-tab-${t}`}>{t}</button>)}
          <button className="ml-auto fe-btn-secondary text-xs" onClick={onClose} data-testid="import-close">Close</button>
        </div>
        {tab === "history" ? <History entity={entity} /> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">Template:</span>
              <button className="text-[#264494] hover:underline" onClick={() => download(`/imports/template/${entity}?format=xlsx`, `${entity}_template.xlsx`)} data-testid="import-template-xlsx">Excel</button>
              <button className="text-[#264494] hover:underline" onClick={() => download(`/imports/template/${entity}?format=csv`, `${entity}_template.csv`)} data-testid="import-template-csv">CSV</button>
              <span className="text-xs text-slate-400">Owner column must hold the employee's work email or name.</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="file" accept=".csv,.xlsx" onChange={(e) => { setFile(e.target.files[0]); setPrev(null); }} data-testid="import-file" />
              <button className="fe-btn-primary text-sm" onClick={() => run()} data-testid="import-preview">Preview</button>
            </div>
            {prev && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm" data-testid="import-mapping">
                  {prev.fields.map((f) => (
                    <label key={f.key} className="text-xs text-slate-600">{f.label}{f.required && " *"}
                      <select className="fe-input py-1 mt-0.5" value={mapping[f.key] || ""} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || undefined })} data-testid={`map-${f.key}`}>
                        <option value="">— not mapped —</option>{prev.headers.map((h) => <option key={h}>{h}</option>)}</select></label>))}
                </div>
                <button className="fe-btn-secondary text-xs" onClick={() => run(Object.fromEntries(Object.entries(mapping).filter(([, v]) => v)))} data-testid="import-remap">Apply mapping & re-validate</button>
                {prev.missing_required.length > 0 ? <div className="text-sm text-rose-600">Map required fields: {prev.missing_required.join(", ")}</div> : (
                  <>
                    <div className="text-sm" data-testid="import-summary">Total {prev.summary.total} · <b className="text-emerald-700">Valid {prev.summary.VALID}</b> · Duplicates {prev.summary.DUPLICATE} · Errors {prev.summary.ERROR}</div>
                    <div className="max-h-72 overflow-auto border border-slate-200 rounded"><table className="fe-table text-xs"><thead><tr><th>Row</th><th>Status</th>{prev.fields.map((f) => <th key={f.key}>{f.label}</th>)}<th>Issues</th></tr></thead>
                      <tbody>{prev.rows.map((r) => <tr key={r.row}><td>{r.row}</td><td><span className={`fe-chip ${CHIP[r.status]}`}>{r.status}</span></td>{prev.fields.map((f) => <td key={f.key}>{r.data[f.key]}</td>)}<td className="text-rose-600">{r.errors.join("; ")}</td></tr>)}</tbody></table></div>
                    {result ? <div className="text-sm text-emerald-700" data-testid="import-result">Imported {result.summary.IMPORTED}; skipped {result.summary.DUPLICATE} duplicate(s) and {result.summary.ERROR} error(s).
                      {(result.summary.DUPLICATE + result.summary.ERROR) > 0 && <button className="ml-2 text-[#264494] hover:underline" onClick={() => download(`/imports/${result.id}/errors`, "import_errors.csv")} data-testid="import-error-report">Download error report</button>}</div>
                      : <button className="fe-btn-primary" disabled={!prev.summary.VALID} onClick={confirm} data-testid="import-confirm">Import {prev.summary.VALID} valid row(s)</button>}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
