import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

export default function AcceptInvite() {
  const { token } = useParams();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [showP1, setShowP1] = useState(false);
  const [showP2, setShowP2] = useState(false);
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
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[#F8F9FA]">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-md"
        data-testid="accept-invite-form"
      >
        <div className="mb-6">
          <img
            src="/logo.png"
            alt="TaskBoard"
            className="h-9 w-auto max-w-[200px] object-contain mb-1.5"
          />
          <div className="text-[11px] text-slate-500 font-medium">Account Activation</div>
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">Activate your account</h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">Create a secure password for your TaskBoard account.</p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              New Password (min 8 characters)
            </label>
            <div className="relative">
              <input
                type={showP1 ? "text" : "password"}
                required
                minLength={8}
                value={p1}
                onChange={(e) => setP1(e.target.value)}
                className="fe-input pr-10"
                data-testid="ai-p1"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowP1(!showP1)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                aria-label={showP1 ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showP1 ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Confirm Password
            </label>
            <div className="relative">
              <input
                type={showP2 ? "text" : "password"}
                required
                minLength={8}
                value={p2}
                onChange={(e) => setP2(e.target.value)}
                className="fe-input pr-10"
                data-testid="ai-p2"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowP2(!showP2)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                aria-label={showP2 ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showP2 ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="fe-btn-primary mt-6 w-full py-2.5 font-semibold shadow-xs"
          data-testid="ai-submit"
        >
          {busy ? "Activating…" : "Activate account"}
        </button>
      </form>
    </div>
  );
}
