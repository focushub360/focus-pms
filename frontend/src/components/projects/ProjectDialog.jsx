import { useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { toast } from "sonner";
import { X } from "lucide-react";

const STAGES = ["Design", "Execution", "Commissioning", "Completed", "On Hold"];

export default function ProjectDialog({ project, users = [], opportunities = [], onClose, onSaved }) {
  const isEdit = Boolean(project?.id);
  const [form, setForm] = useState({
    name: project?.name || "",
    client_name: project?.client_name || "",
    stage: project?.stage || "Design",
    contract_value_inr: project?.contract_value_inr ?? 0,
    invoiced_inr: project?.invoiced_inr ?? 0,
    collected_inr: project?.collected_inr ?? 0,
    progress_pct: project?.progress_pct ?? 10,
    project_manager_id: project?.project_manager_id || "",
    opportunity_id: project?.opportunity_id || "",
    start_date: (project?.start_date || "").slice(0, 10),
    expected_end_date: (project?.expected_end_date || "").slice(0, 10),
    notes: project?.notes || "",
  });
  const [busy, setBusy] = useState(false);
  const [empList, setEmpList] = useState(users);

  useEffect(() => {
    if (!users.length) {
      api.get("/users").then((r) => setEmpList(r.data)).catch(() => {});
    }
  }, [users.length]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const payload = {
      ...form,
      contract_value_inr: Number(form.contract_value_inr || 0),
      invoiced_inr: Number(form.invoiced_inr || 0),
      collected_inr: Number(form.collected_inr || 0),
      progress_pct: Number(form.progress_pct || 0),
      project_manager_id: form.project_manager_id || null,
      opportunity_id: form.opportunity_id || null,
      start_date: form.start_date || null,
      expected_end_date: form.expected_end_date || null,
    };
    try {
      if (isEdit) {
        await api.patch(`/projects/${project.id}`, payload);
        toast.success("Project updated");
      } else {
        await api.post("/projects", payload);
        toast.success("Project created");
      }
      onSaved();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-4 sm:p-5 text-slate-900"
        data-testid="project-dialog"
      >
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-[#262262]">
              {isEdit ? `Edit Project · ${project.project_code || ""}` : "New Engineering Project"}
            </h3>
            <p className="text-[11px] text-slate-500">Design, Execution, Commissioning &amp; Finance</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-2 mt-3">
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Project Name *</label>
            <input required className="fe-input !py-1.5 !px-2.5 !text-xs !rounded-lg mt-0.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="proj-name" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Stage</label>
            <select className="fe-input !py-1.5 !px-2.5 !text-xs !rounded-lg mt-0.5" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} data-testid="proj-stage">
              {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Client / Account *</label>
            <input required className="fe-input !py-1.5 !px-2.5 !text-xs !rounded-lg mt-0.5" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} data-testid="proj-client" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Project Manager</label>
            <select className="fe-input !py-1.5 !px-2.5 !text-xs !rounded-lg mt-0.5" value={form.project_manager_id} onChange={(e) => setForm({ ...form, project_manager_id: e.target.value })}>
              <option value="">— Auto —</option>
              {empList.filter((u) => u.is_active !== false).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Linked Opportunity</label>
            <select className="fe-input !py-1.5 !px-2.5 !text-xs !rounded-lg mt-0.5" value={form.opportunity_id} onChange={(e) => setForm({ ...form, opportunity_id: e.target.value })}>
              <option value="">— None —</option>
              {opportunities.map((o) => <option key={o.id} value={o.id}>{o.title} ({o.account_name})</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Contract Value (INR)</label>
            <input type="number" min="0" step="1000" className="fe-input !py-1.5 !px-2.5 !text-xs !rounded-lg mt-0.5" value={form.contract_value_inr} onChange={(e) => setForm({ ...form, contract_value_inr: e.target.value })} data-testid="proj-value" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Invoiced (INR)</label>
            <input type="number" min="0" step="1000" className="fe-input !py-1.5 !px-2.5 !text-xs !rounded-lg mt-0.5" value={form.invoiced_inr} onChange={(e) => setForm({ ...form, invoiced_inr: e.target.value })} data-testid="proj-invoiced" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Collected (INR)</label>
            <input type="number" min="0" step="1000" className="fe-input !py-1.5 !px-2.5 !text-xs !rounded-lg mt-0.5" value={form.collected_inr} onChange={(e) => setForm({ ...form, collected_inr: e.target.value })} data-testid="proj-collected" />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Progress ({form.progress_pct}%)</label>
            <input type="range" min="0" max="100" step="5" className="w-full mt-2 accent-[#264494]" value={form.progress_pct} onChange={(e) => setForm({ ...form, progress_pct: Number(e.target.value) })} data-testid="proj-progress" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Start Date</label>
            <input type="date" className="fe-input !py-1.5 !px-2.5 !text-xs !rounded-lg mt-0.5" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Target Completion</label>
            <input type="date" className="fe-input !py-1.5 !px-2.5 !text-xs !rounded-lg mt-0.5" value={form.expected_end_date} onChange={(e) => setForm({ ...form, expected_end_date: e.target.value })} />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Notes</label>
            <input type="text" className="fe-input !py-1.5 !px-2.5 !text-xs !rounded-lg mt-0.5" placeholder="Optional project remarks…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="fe-btn-secondary !py-1.5 !px-3 !text-xs">Cancel</button>
          <button type="submit" disabled={busy} className="fe-btn-primary !py-1.5 !px-3.5 !text-xs" data-testid="proj-submit">
            {busy ? "Saving…" : isEdit ? "Save Changes" : "Create Project"}
          </button>
        </div>
      </form>
    </div>
  );
}
