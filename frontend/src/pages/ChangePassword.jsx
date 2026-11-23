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
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[#F8F9FA]">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-md"
        data-testid="change-password-form"
      >
        <div className="mb-6">
          <img
            src="/logo.png"
            alt="TaskBoard"
            className="h-9 w-auto max-w-[200px] object-contain mb-1.5"
          />
          <div className="text-[11px] text-slate-500 font-medium">Security &amp; Password</div>
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">Change your password</h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Signed in as <strong className="text-slate-700">{user?.email}</strong>. Please set a secure new password to continue.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Current Password</label>
            <input
              type="password"
              required
              value={cur}
              onChange={(e) => setCur(e.target.value)}
              className="fe-input"
              data-testid="cp-current"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">New Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={n1}
              onChange={(e) => setN1(e.target.value)}
              className="fe-input"
              data-testid="cp-new1"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Confirm New Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={n2}
              onChange={(e) => setN2(e.target.value)}
              className="fe-input"
              data-testid="cp-new2"
              placeholder="••••••••"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="fe-btn-primary mt-6 w-full py-2.5 font-semibold shadow-xs"
          data-testid="cp-submit"
        >
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
