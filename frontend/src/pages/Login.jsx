import { useState } from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const location = useLocation();

  if (user) return <Navigate to={location.state?.from || "/app/dashboard"} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await login(email, password);
      toast.success(`Welcome, ${r.user.name}`);
      if (r.must_change_password) nav("/change-password");
      else nav("/app/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex" style={{ background: "#F8F9FA" }}>
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12 text-white" style={{ background: "#262262" }}>
        <div className="flex items-center gap-3">
          <div className="fe-brand-gear">FE</div>
          <div>
            <div className="font-bold text-lg">Focus Engineering</div>
            <div className="text-[11px] uppercase tracking-widest" style={{ color: "#51C5DC" }}>PMS</div>
          </div>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight" style={{ letterSpacing: "-0.02em" }}>
            Sales &amp; Marketing<br />Performance Management
          </h1>
          <p className="mt-5 text-[15px] text-slate-300 max-w-md">
            One integrated workspace for the Focus Engineering Sales &amp; Marketing team —
            opportunities, campaigns, targets, and management-level insight.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4 max-w-md">
            <div className="p-4 rounded-lg" style={{ background: "#322D7A" }}>
              <div className="text-xs uppercase tracking-wider" style={{ color: "#51C5DC" }}>Team</div>
              <div className="text-xl font-bold mt-1">6+</div>
              <div className="text-xs text-slate-300">Sales Contributors</div>
            </div>
            <div className="p-4 rounded-lg" style={{ background: "#322D7A" }}>
              <div className="text-xs uppercase tracking-wider" style={{ color: "#51C5DC" }}>Dept</div>
              <div className="text-xl font-bold mt-1">S&amp;M</div>
              <div className="text-xs text-slate-300">Integrated Department</div>
            </div>
            <div className="p-4 rounded-lg" style={{ background: "#322D7A" }}>
              <div className="text-xs uppercase tracking-wider" style={{ color: "#51C5DC" }}>FY</div>
              <div className="text-xl font-bold mt-1">26-27</div>
              <div className="text-xs text-slate-300">Current Period</div>
            </div>
          </div>
        </div>
        <div className="text-xs text-slate-400">
          © Focus Engineering. Internal performance management system.
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-md bg-white rounded-xl border border-slate-200 p-8 shadow-sm" data-testid="login-form">
          <h2 className="text-2xl font-bold" style={{ color: "#262262" }}>Sign in</h2>
          <p className="text-sm text-slate-500 mt-1">Use your official Focus Engineering email.</p>

          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mt-6">Official Email</label>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="name@focusengineering.in" className="fe-input mt-1" data-testid="login-email"
          />
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mt-4">Password</label>
          <input
            type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="fe-input mt-1" data-testid="login-password"
          />
          <button type="submit" disabled={busy} className="fe-btn-primary mt-6 w-full" data-testid="login-submit">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <div className="mt-4 flex justify-between text-xs">
            <button type="button" onClick={() => nav("/forgot-password")} className="text-slate-500 hover:underline" data-testid="forgot-password-link">
              Forgot password?
            </button>
            <span className="text-slate-400">Access by invitation only</span>
          </div>
        </form>
      </div>
    </div>
  );
}
