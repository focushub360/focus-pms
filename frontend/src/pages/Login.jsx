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
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F8F9FA]">
      {/* ────────────────── DESKTOP BRANDING BANNER (>= 1024px) ────────────────── */}
      <div
        className="hidden lg:flex w-1/2 flex-col justify-between p-12 text-white relative overflow-hidden"
        style={{ background: "#262262" }}
      >
        <div className="flex items-center gap-3.5 z-10">
          <img
            src="/logo.png"
            alt="TaskBoard"
            className="h-12 w-12 object-contain bg-white/10 p-2 rounded-xl border border-white/20 shadow-md"
          />
          <div>
            <div className="font-bold text-2xl tracking-tight text-white leading-tight">TaskBoard</div>
            <div className="text-xs uppercase tracking-widest text-[#51C5DC] font-semibold">
              Performance &amp; Management Hub
            </div>
          </div>
        </div>

        <div className="z-10 max-w-lg my-auto py-12">
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight tracking-tight text-white">
            Performance,<br />Tasks &amp; Growth<br />
            <span className="text-[#51C5DC]">Unified.</span>
          </h1>
          <p className="mt-5 text-base text-slate-300 leading-relaxed max-w-md">
            One high-precision platform for the team — manage opportunities, target scorecards,
            daily sales meetings, and real-time executive visibility.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3.5 max-w-md">
            <div className="p-3.5 rounded-xl bg-[#322D7A]/80 border border-white/10">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-[#51C5DC]">Team</div>
              <div className="text-2xl font-bold mt-1 text-white">6+</div>
              <div className="text-xs text-slate-300 truncate">Contributors</div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#322D7A]/80 border border-white/10">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-[#51C5DC]">Dept</div>
              <div className="text-2xl font-bold mt-1 text-white">S&amp;M</div>
              <div className="text-xs text-slate-300 truncate">Sales &amp; Mktg</div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#322D7A]/80 border border-white/10">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-[#51C5DC]">FY</div>
              <div className="text-2xl font-bold mt-1 text-white">26-27</div>
              <div className="text-xs text-slate-300 truncate">Current Period</div>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-400 z-10 flex items-center justify-between">
          <span>© TaskBoard. Enterprise performance workspace.</span>
          <span>v1.0.0</span>
        </div>
      </div>

      {/* ────────────────── LOGIN FORM CARD (Mobile, Tablet, Desktop) ────────────────── */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 min-h-screen">
        <form
          onSubmit={submit}
          className="w-full max-w-md bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-9 shadow-lg sm:shadow-md"
          data-testid="login-form"
        >
          {/* Mobile & Tablet Logo Header */}
          <div className="flex items-center gap-3 mb-6">
            <img
              src="/logo.png"
              alt="TaskBoard"
              className="h-11 w-11 object-contain rounded-xl p-1 bg-slate-50 border border-slate-200 shadow-2xs shrink-0"
            />
            <div>
              <div className="font-bold text-xl sm:text-2xl text-[#262262] leading-tight">
                TaskBoard
              </div>
              <div className="text-xs text-slate-500 font-medium">
                Sales &amp; Performance Management
              </div>
            </div>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">Sign in</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Enter your official email and password to access your dashboard.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Official Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@focusengineering.in"
                className="fe-input"
                data-testid="login-email"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="fe-input"
                data-testid="login-password"
                autoComplete="current-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="fe-btn-primary mt-6 w-full py-2.5 text-sm font-semibold shadow-xs"
            data-testid="login-submit"
          >
            {busy ? "Signing in…" : "Sign in to TaskBoard"}
          </button>

          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => nav("/forgot-password")}
              className="text-[#264494] font-medium hover:underline"
              data-testid="forgot-password-link"
            >
              Forgot password?
            </button>
            <span className="text-slate-400">Access by invitation only</span>
          </div>
        </form>
      </div>
    </div>
  );
}
