import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Link, useParams } from "react-router-dom";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    try { await api.post("/auth/request-reset", { email }); setSent(true); toast.success("If the email exists, a reset link has been sent."); }
    catch { setSent(true); }
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F8F9FA" }}>
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
        <h2 className="text-2xl font-bold" style={{ color: "#262262" }}>Forgot password?</h2>
        <p className="text-sm text-slate-500 mt-1">Enter your Focus Engineering email. We will send a secure reset link.</p>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mt-6">Email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="fe-input mt-1" data-testid="fp-email"/>
        <button type="submit" className="fe-btn-primary mt-6 w-full" data-testid="fp-submit">Send reset link</button>
        {sent && <div className="text-xs text-slate-500 mt-3">If an account exists for that email, you will receive a reset email shortly.</div>}
        <div className="text-xs text-center mt-4"><Link to="/login" className="text-slate-500 hover:underline">Back to sign in</Link></div>
      </form>
    </div>
  );
}

export function ResetPassword() {
  const { token } = useParams();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [done, setDone] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (p1 !== p2) return toast.error("Passwords do not match");
    try { await api.post("/auth/reset-password", { token, new_password: p1 }); setDone(true); toast.success("Password updated. Please sign in."); }
    catch (err) { toast.error(err?.response?.data?.detail || "Invalid or expired link"); }
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F8F9FA" }}>
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
        <h2 className="text-2xl font-bold" style={{ color: "#262262" }}>Reset password</h2>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mt-6">New Password</label>
        <input type="password" required value={p1} onChange={(e) => setP1(e.target.value)} className="fe-input mt-1"/>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mt-4">Confirm Password</label>
        <input type="password" required value={p2} onChange={(e) => setP2(e.target.value)} className="fe-input mt-1"/>
        <button type="submit" className="fe-btn-primary mt-6 w-full">Reset password</button>
        {done && <div className="text-xs text-slate-500 mt-3"><Link to="/login" className="text-[#264494] font-semibold">Go to sign in</Link></div>}
      </form>
    </div>
  );
}
