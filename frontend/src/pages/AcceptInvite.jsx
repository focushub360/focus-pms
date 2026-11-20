import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function AcceptInvite() {
  const { token } = useParams();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (p1.length < 8) return toast.error("At least 8 characters required");
    if (p1 !== p2) return toast.error("Passwords do not match");
    setBusy(true);
    try {
      await api.post("/auth/accept-invite", { token, new_password: p1 });
      toast.success("Account activated. Please sign in.");
      nav("/login");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Invitation invalid");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F8F9FA" }}>
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-xl border border-slate-200 p-8 shadow-sm" data-testid="accept-invite-form">
        <h2 className="text-2xl font-bold" style={{ color: "#262262" }}>Activate your account</h2>
        <p className="text-sm text-slate-500 mt-1">Create a secure password for your Focus PMS account.</p>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mt-6">New Password</label>
        <input type="password" required value={p1} onChange={(e) => setP1(e.target.value)} className="fe-input mt-1" data-testid="ai-p1" />
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mt-4">Confirm Password</label>
        <input type="password" required value={p2} onChange={(e) => setP2(e.target.value)} className="fe-input mt-1" data-testid="ai-p2" />
        <button type="submit" disabled={busy} className="fe-btn-primary mt-6 w-full" data-testid="ai-submit">
          {busy ? "Activating…" : "Activate account"}
        </button>
      </form>
    </div>
  );
}
