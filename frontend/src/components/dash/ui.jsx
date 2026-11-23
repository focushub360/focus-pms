import { STATUS_META } from "@/lib/api";
import { Loader2, Inbox } from "lucide-react";

export const KpiCard = ({ label, value, sub, accent = "#264494", testid }) => (
  <div className="fe-kpi-card group cursor-default" data-testid={testid} style={{ "--acc": accent }}>
    <span className="absolute top-0 left-0 right-0 h-[4px] rounded-t-2xl" style={{ background: `linear-gradient(90deg, ${accent}, #007AFF)` }} />
    <div className="fe-kpi-label">{label}</div>
    <div className="fe-kpi-value text-[22px] lg:text-[26px]">{value}</div>
    {sub && <div className="fe-kpi-sub">{sub}</div>}
  </div>
);

export const Panel = ({ title, right, children, className = "", testid }) => (
  <section className={`ios-card overflow-hidden ${className}`} data-testid={testid}>
    {(title || right) && (
      <div className="px-6 py-4 border-b border-slate-100/90 flex items-center justify-between gap-3 bg-white/60 backdrop-blur-md">
        <h3 className="font-bold text-[15px] bg-gradient-to-r from-[#262262] to-[#264494] bg-clip-text text-transparent">{title}</h3>
        {right}
      </div>
    )}
    <div className="p-6">{children}</div>
  </section>
);

export const Empty = ({ text = "No records yet.", hint }) => (
  <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400" data-testid="empty-state">
    <Inbox size={28} className="mb-2" />
    <div className="text-sm">{text}</div>
    {hint && <div className="text-xs mt-1 text-slate-400 max-w-xs">{hint}</div>}
  </div>
);

export const Loading = ({ text = "Loading…" }) => (
  <div className="flex items-center justify-center gap-2 py-16 text-slate-500" data-testid="loading">
    <Loader2 className="animate-spin" size={18} /> {text}
  </div>
);

export const StatusChip = ({ status }) => {
  const m = STATUS_META[status] || { label: status || "—", cls: "fe-chip-blue" };
  return <span className={`fe-chip ${m.cls}`}>{m.label}</span>;
};

export const Progress = ({ pct, color = "#264494", height = 10 }) => (
  <div className="w-full bg-slate-100 rounded-full overflow-hidden" style={{ height }}>
    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(pct || 0, 100)}%`, background: color }} />
  </div>
);

export const Select = ({ value, onChange, options, testid, className = "" }) => (
  <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={`fe-input py-1.5 text-sm w-auto ${className}`} data-testid={testid}>
    {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);
