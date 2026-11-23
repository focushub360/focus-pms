import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Link, useParams } from "react-router-dom";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/request-reset", { email });
      setSent(true);
      toast.success("If the email exists, a reset link has been sent.");
    } catch {
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[#F8F9FA]">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-md">
        <div className="flex items-center gap-3 mb-6">
          <img
            src="/logo.png"
            alt="TaskBoard"
            className="h-10 w-10 object-contain rounded-xl p-1 bg-slate-50 border border-slate-200"
          />
          <div>
            <div className="font-bold text-xl text-[#262262] leading-tight">TaskBoard</div>
            <div className="text-[11px] text-slate-500 font-medium">Password Recovery</div>
          </div>
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">Forgot password?</h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Enter your official TaskBoard account email to receive a secure reset link.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="fe-input"
              data-testid="fp-email"
              placeholder="name@focusengineering.in"
            />
          </div>
        </div>

        <button type="submit" disabled={busy} className="fe-btn-primary mt-6 w-full py-2.5 font-semibold shadow-xs" data-testid="fp-submit">
          {busy ? "Sending…" : "Send reset link"}
        </button>

        {sent && (
          <div className="text-xs text-slate-500 mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
            If an account exists for that email, you will receive a reset email shortly with instructions.
          </div>
        )}

        <div className="text-xs text-center mt-5 pt-3 border-t border-slate-100">
          <Link to="/login" className="text-[#264494] font-medium hover:underline">
            ← Back to sign in
          </Link>
        </div>
      </form>
    </div>
  );
}

export function ResetPassword() {
  const { token } = useParams();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (p1.length < 8) return toast.error("Password must be at least 8 characters");
    if (p1 !== p2) return toast.error("Passwords do not match");
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: p1 });
      setDone(true);
      toast.success("Password updated. Please sign in.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Invalid or expired link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[#F8F9FA]">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-md">
        <div className="flex items-center gap-3 mb-6">
          <img
            src="/logo.png"
            alt="TaskBoard"
            className="h-10 w-10 object-contain rounded-xl p-1 bg-slate-50 border border-slate-200"
          />
          <div>
            <div className="font-bold text-xl text-[#262262] leading-tight">TaskBoard</div>
            <div className="text-[11px] text-slate-500 font-medium">New Password</div>
          </div>
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">Reset password</h2>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">New Password (min 8 chars)</label>
            <input
              type="password"
              required
              minLength={8}
              value={p1}
              onChange={(e) => setP1(e.target.value)}
              className="fe-input"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Confirm Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={p2}
              onChange={(e) => setP2(e.target.value)}
              className="fe-input"
              placeholder="••••••••"
            />
          </div>
        </div>

        <button type="submit" disabled={busy} className="fe-btn-primary mt-6 w-full py-2.5 font-semibold shadow-xs">
          {busy ? "Resetting…" : "Reset password"}
        </button>

        {done && (
          <div className="text-xs text-center mt-4">
            <Link to="/login" className="text-[#264494] font-semibold hover:underline">
              Go to sign in →
            </Link>
          </div>
        )}
      </form>
    </div>
  );
}
