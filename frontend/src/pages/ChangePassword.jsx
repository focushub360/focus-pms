import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function ChangePassword() {
  const { refresh, user } = useAuth();
  const [cur, setCur] = useState("");
  const [n1, setN1] = useState("");
  const [n2, setN2] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (n1.length < 8) return toast.error("Password must be at least 8 characters");
    if (n1 !== n2) return toast.error("Passwords do not match");
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: cur, new_password: n1 });
      await refresh();
      toast.success("Password updated");
      nav("/app/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not change password");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F8F9FA" }}>
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-xl border border-slate-200 p-8 shadow-sm" data-testid="change-password-form">
        <h2 className="text-2xl font-bold" style={{ color: "#262262" }}>Change your password</h2>
        <p className="text-sm text-slate-500 mt-1">
          Signed in as <strong>{user?.email}</strong>. You must set a new password before continuing.
        </p>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mt-6">Current Password</label>
        <input type="password" required value={cur} onChange={(e) => setCur(e.target.value)} className="fe-input mt-1" data-testid="cp-current" />
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mt-4">New Password</label>
        <input type="password" required value={n1} onChange={(e) => setN1(e.target.value)} className="fe-input mt-1" data-testid="cp-new1" />
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mt-4">Confirm New Password</label>
        <input type="password" required value={n2} onChange={(e) => setN2(e.target.value)} className="fe-input mt-1" data-testid="cp-new2" />
        <button type="submit" disabled={busy} className="fe-btn-primary mt-6 w-full" data-testid="cp-submit">
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
