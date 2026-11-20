import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function Profile() {
  const { user, refresh } = useAuth();
  const [cur, setCur] = useState("");
  const [n1, setN1] = useState("");
  const [n2, setN2] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (n1 !== n2) return toast.error("Passwords do not match");
    try { await api.post("/auth/change-password", { current_password: cur, new_password: n1 }); toast.success("Password updated"); setCur(""); setN1(""); setN2(""); refresh(); }
    catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-6" data-testid="profile-page">
      <h1 className="text-2xl lg:text-3xl font-bold" style={{ color: "#262262" }}>My profile</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-2">
          <Row k="Name" v={user?.name}/><Row k="Email" v={user?.email}/>
          <Row k="Designation" v={user?.designation}/><Row k="Department" v={user?.department}/>
          <Row k="Functional Responsibility" v={user?.functional_responsibility}/>
          <Row k="Role(s)" v={(user?.role_codes || []).join(", ")}/>
          <Row k="Data Visibility" v={user?.data_visibility}/>
          <Row k="Sales Contributor" v={user?.is_sales_contributor ? "Yes" : "No"}/>
        </div>
        <form onSubmit={submit} className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="font-semibold" style={{ color: "#262262" }}>Change password</h3>
          <label className="fe-kpi-label mt-4 block">Current</label>
          <input type="password" required value={cur} onChange={(e) => setCur(e.target.value)} className="fe-input mt-1"/>
          <label className="fe-kpi-label mt-3 block">New</label>
          <input type="password" required value={n1} onChange={(e) => setN1(e.target.value)} className="fe-input mt-1"/>
          <label className="fe-kpi-label mt-3 block">Confirm</label>
          <input type="password" required value={n2} onChange={(e) => setN2(e.target.value)} className="fe-input mt-1"/>
          <button className="fe-btn-primary mt-5">Update password</button>
        </form>
      </div>
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h3 className="font-semibold mb-3" style={{ color: "#262262" }}>Effective permissions</h3>
        <div className="flex flex-wrap gap-2">
          {(user?.permissions || []).map((p) => <span key={p} className="fe-chip fe-chip-blue">{p}</span>)}
          {user?.is_super_admin && <span className="fe-chip fe-chip-purple">ALL (Super Admin)</span>}
        </div>
      </div>
    </div>
  );
}

const Row = ({ k, v }) => (
  <div className="flex justify-between py-2 border-b border-slate-100 last:border-0">
    <div className="text-xs uppercase tracking-wider text-slate-500">{k}</div>
    <div className="text-sm font-semibold text-slate-800">{v || "—"}</div>
  </div>
);
