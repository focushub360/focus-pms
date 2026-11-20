import { useEffect, useState } from "react";
import { api, hasPerm } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import ReasonDialog from "@/components/dash/ReasonDialog";

const DEFAULT_FORM = {
  name: "", employee_id: "", email: "", mobile: "", designation: "",
  department: "Sales & Marketing", functional_responsibility: "",
  reporting_manager_id: "", team: "Integrated Sales & Marketing",
  joining_date: "", employment_status: "Active",
  role_codes: ["SALES_MARKETING_CONTRIBUTOR"], extra_permissions: [],
  data_visibility: "OWN",
  is_sales_contributor: true, sales_target_eligible: true, activity_kpi_eligible: true,
};

export default function Users() {
  const { user } = useAuth();
  const canAdmin = hasPerm(user, "USER_ONBOARDING_ADMIN");
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [perms, setPerms] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [inviteLink, setInviteLink] = useState("");
  const [showAll, setShowAll] = useState(false);
  const visibleUsers = users.filter((u) => showAll || (u.is_active && !u.is_test && !u.is_duplicate));
  const hiddenCount = users.length - visibleUsers.length;

  const load = async () => {
    const [u, r, p] = await Promise.all([
      api.get("/users"), api.get("/roles"), api.get("/permissions"),
    ]);
    setUsers(u.data); setRoles(r.data); setPerms(p.data);
  };
  useEffect(() => { load(); }, []);

  const resetForm = () => { setForm(DEFAULT_FORM); setEditing(null); setInviteLink(""); };

  const openEdit = (u) => {
    setEditing(u);
    setForm({
      ...DEFAULT_FORM, ...u,
      reporting_manager_id: u.reporting_manager_id || "",
      role_codes: u.role_codes || [],
      extra_permissions: u.extra_permissions || [],
    });
    setShowForm(true);
  };

  const toggleRole = (code) => setForm((f) => ({ ...f, role_codes: f.role_codes.includes(code) ? f.role_codes.filter((x) => x !== code) : [...f.role_codes, code] }));
  const togglePerm = (code) => setForm((f) => ({ ...f, extra_permissions: f.extra_permissions.includes(code) ? f.extra_permissions.filter((x) => x !== code) : [...f.extra_permissions, code] }));

  const save = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.patch(`/users/${editing.id}`, form);
        toast.success("User updated");
      } else {
        const r = await api.post("/users", form);
        toast.success(r.data.email_sent ? "Invitation sent" : "User created (email pending)");
        setInviteLink(r.data.invite_link);
      }
      await load();
      if (editing) { setShowForm(false); resetForm(); }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to save");
    }
  };

  const toggleActive = async (u) => {
    await api.patch(`/users/${u.id}`, { is_active: !u.is_active });
    toast.success(!u.is_active ? "Account activated" : "Account deactivated");
    load();
  };

  const [archiving, setArchiving] = useState(null);
  const archiveAct = async (u, kind, reason) => {
    try { await api.post(`/users/${u.id}/${kind}`, { reason }); toast.success(kind === "archive" ? "Employee archived" : "Employee restored"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const deleteUser = async (u) => {
    try {
      const { data } = await api.get(`/users/${u.id}/delete-check`);
      if (data.has_history) { toast.error("This employee has history (records, KPIs or audit actions). Archive instead."); return; }
      const email = window.prompt(`Permanently delete ${u.name}? This cannot be undone. Type their email to confirm:`);
      if (!email) return;
      await api.post(`/users/${u.id}/delete`, { confirm_email: email, reason: "Permanent deletion of account with no history" });
      toast.success("Employee permanently deleted"); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const resendInvite = async (u) => {
    const r = await api.post(`/users/${u.id}/resend-invite`);
    toast.success(r.data.email_sent ? "Invite resent" : "Invite link ready");
    setInviteLink(r.data.invite_link);
  };

  return (
    <div className="space-y-6" data-testid="users-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold" style={{ color: "#262262" }}>User &amp; Access Management</h1>
          <p className="text-sm text-slate-500 mt-1">Onboard employees, assign roles and manage access.</p>
        </div>
        {canAdmin && (
          <button className="fe-btn-primary" onClick={() => { resetForm(); setShowForm(true); }} data-testid="btn-new-user">
            + Onboard employee
          </button>
        )}
      </div>

      {inviteLink && (
        <div className="bg-[#DCF3F8] border border-[#51C5DC] rounded-md p-4 text-sm" data-testid="invite-link-box">
          <div className="font-semibold" style={{ color: "#0E7A95" }}>Invitation ready</div>
          <div className="text-slate-700 mt-1 break-all">{inviteLink}</div>
          <div className="text-xs text-slate-500 mt-1">Email delivery is also attempted. Share the link if email is unavailable.</div>
        </div>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">{visibleUsers.length} shown{hiddenCount > 0 && !showAll ? ` · ${hiddenCount} inactive / test / duplicate hidden` : ""}</span>
        <label className="flex items-center gap-2 text-slate-600"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} data-testid="toggle-show-all-users" /> Show inactive, test &amp; duplicate records</label>
      </div>
      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="fe-table" data-testid="users-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Designation / Role</th>
              <th>Department</th>
              <th>Visibility</th>
              <th>Sales Contributor</th>
              <th>Status</th>
              {canAdmin && <th className="text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map((u) => (
              <tr key={u.id} data-testid={`user-row-${u.email}`} className={u.is_active && !u.is_test && !u.is_duplicate ? "" : "opacity-60"}>
                <td>
                  <div className="font-semibold text-slate-800">{u.name}{u.is_super_admin && <span className="ml-2 fe-chip fe-chip-purple">Super Admin</span>}{u.is_test && <span className="ml-2 fe-chip fe-chip-purple" data-testid="label-test">Test user</span>}{u.is_duplicate && <span className="ml-2 fe-chip fe-chip-orange" data-testid="label-duplicate">Duplicate record</span>}</div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </td>
                <td>
                  <div>{u.designation}</div>
                  <div className="text-xs text-slate-500">{(u.role_codes || []).join(", ")}</div>
                </td>
                <td>{u.department}</td>
                <td><span className="fe-chip fe-chip-blue">{u.data_visibility}</span></td>
                <td>{u.is_sales_contributor ? <span className="fe-chip fe-chip-green">Yes</span> : <span className="fe-chip fe-chip-orange">No</span>}</td>
                <td>{u.is_archived ? <span className="fe-chip fe-chip-orange" data-testid={`archived-${u.email}`}>Archived</span> : u.is_active ? <span className="fe-chip fe-chip-green">Active</span> : <span className="fe-chip fe-chip-red">Inactive</span>}</td>
                {canAdmin && (
                  <td className="text-right whitespace-nowrap">
                    <button className="text-xs text-[#264494] hover:underline mr-3" onClick={() => openEdit(u)} data-testid={`edit-${u.email}`}>Edit</button>
                    {!u.is_archived && <button className="text-xs text-[#264494] hover:underline mr-3" onClick={() => resendInvite(u)} data-testid={`invite-${u.email}`}>Resend invite</button>}
                    {!u.is_super_admin && u.id !== user.id && (<>
                      {!u.is_archived && <button className="text-xs text-rose-600 hover:underline mr-3" onClick={() => toggleActive(u)} data-testid={`toggle-${u.email}`}>
                        {u.is_active ? "Deactivate" : "Activate"}
                      </button>}
                      <button className="text-xs text-amber-700 hover:underline mr-3" onClick={() => setArchiving({ u, kind: u.is_archived ? "restore" : "archive" })} data-testid={`archive-${u.email}`}>
                        {u.is_archived ? "Restore" : "Archive"}
                      </button>
                      {user.is_super_admin && <button className="text-xs text-rose-700 hover:underline" onClick={() => deleteUser(u)} data-testid={`delete-${u.email}`}>Delete</button>}
                    </>)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {archiving && <ReasonDialog title={`${archiving.kind === "archive" ? "Archive" : "Restore"} ${archiving.u.name}`} confirmText={archiving.kind === "archive" ? "Archive" : "Restore"}
        onCancel={() => setArchiving(null)} onConfirm={(r) => { const a = archiving; setArchiving(null); archiveAct(a.u, a.kind, r); }} />}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto" data-testid="user-form-modal">
          <form onSubmit={save} className="bg-white rounded-xl shadow-xl max-w-3xl w-full my-8 p-6 border border-slate-200">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold" style={{ color: "#262262" }}>{editing ? "Edit employee" : "Onboard employee"}</h2>
                <p className="text-sm text-slate-500 mt-1">All six contributors are equal sales participants with their own functional KPIs.</p>
              </div>
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="text-slate-400 hover:text-slate-700" data-testid="close-form">✕</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <Field label="Employee Name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="fe-input" data-testid="f-name"/></Field>
              <Field label="Employee ID"><input value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} className="fe-input" placeholder="auto if blank" data-testid="f-empid"/></Field>
              <Field label="Official Email"><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="fe-input" data-testid="f-email"/></Field>
              <Field label="Mobile Number"><input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="fe-input"/></Field>
              <Field label="Designation"><input required value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} className="fe-input" data-testid="f-designation"/></Field>
              <Field label="Department"><input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="fe-input"/></Field>
              <Field label="Functional Responsibility"><input value={form.functional_responsibility} onChange={(e) => setForm({ ...form, functional_responsibility: e.target.value })} className="fe-input" placeholder="e.g. Business Development"/></Field>
              <Field label="Reporting Manager">
                <select value={form.reporting_manager_id || ""} onChange={(e) => setForm({ ...form, reporting_manager_id: e.target.value || null })} className="fe-input">
                  <option value="">— None —</option>
                  {users.filter((u) => u.id !== editing?.id).map((u) => <option key={u.id} value={u.id}>{u.name} · {u.designation}</option>)}
                </select>
              </Field>
              <Field label="Team"><input value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} className="fe-input"/></Field>
              <Field label="Joining Date"><input type="date" value={(form.joining_date || "").slice(0,10)} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} className="fe-input"/></Field>
              <Field label="Employment Status">
                <select value={form.employment_status} onChange={(e) => setForm({ ...form, employment_status: e.target.value })} className="fe-input">
                  <option>Active</option><option>On Leave</option><option>Resigned</option>
                </select>
              </Field>
              <Field label="Data Visibility">
                <select value={form.data_visibility} onChange={(e) => setForm({ ...form, data_visibility: e.target.value })} className="fe-input" data-testid="f-visibility">
                  <option value="OWN">Own records only</option>
                  <option value="TEAM">Team</option>
                  <option value="DEPARTMENT">Department</option>
                  <option value="ALL">All records</option>
                </select>
              </Field>
            </div>

            <div className="mt-6">
              <div className="fe-kpi-label mb-2">Assigned Roles</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2" data-testid="roles-chooser">
                {roles.map((r) => (
                  <label key={r.id} className={`flex items-start gap-2 p-3 rounded-md border cursor-pointer ${form.role_codes.includes(r.code) ? "border-[#264494] bg-[#DCE4F7]" : "border-slate-200 bg-white"}`}>
                    <input type="checkbox" checked={form.role_codes.includes(r.code)} onChange={() => toggleRole(r.code)} />
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{r.name}</div>
                      <div className="text-xs text-slate-500">{r.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <div className="fe-kpi-label mb-2">Additional Module Permissions</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1 max-h-56 overflow-y-auto p-3 border border-slate-200 rounded-md">
                {perms.map((p) => (
                  <label key={p.code} className="flex items-start gap-2 text-xs text-slate-700">
                    <input type="checkbox" checked={form.extra_permissions.includes(p.code)} onChange={() => togglePerm(p.code)} />
                    <span><strong>{p.code}</strong> — {p.description}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_sales_contributor} onChange={(e) => setForm({ ...form, is_sales_contributor: e.target.checked })}/> Sales contributor</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.sales_target_eligible} onChange={(e) => setForm({ ...form, sales_target_eligible: e.target.checked })}/> Eligible for sales target</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.activity_kpi_eligible} onChange={(e) => setForm({ ...form, activity_kpi_eligible: e.target.checked })}/> Eligible for activity KPI</label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="fe-btn-secondary">Cancel</button>
              <button type="submit" className="fe-btn-primary" data-testid="f-submit">{editing ? "Save changes" : "Create & invite"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const Field = ({ label, children }) => (
  <div>
    <label className="fe-kpi-label block mb-1">{label}</label>
    {children}
  </div>
);
