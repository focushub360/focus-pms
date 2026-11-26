import { useState } from "react";
import { fmtINR } from "@/lib/api";
import { Flame, Sun, Snowflake, Users, Handshake, Trophy, ArrowDown } from "lucide-react";

/**
 * Interactive animated 3D perspective sales funnel (Light Theme):
 * Leads (Hot / Warm / Cold) -> Meetings -> Converted Deals -> Revenue Won.
 */
export default function Funnel3D({ funnel }) {
  const [activeTier, setActiveTier] = useState(null);
  if (!funnel) return null;

  const hot = funnel.hot_leads || { count: 0, value_inr: 0 };
  const warm = funnel.warm_leads || { count: 0, value_inr: 0 };
  const cold = funnel.cold_leads || { count: 0, value_inr: 0 };
  const totalLeads = funnel.total_leads || { count: 0, value_inr: 0 };
  const meetings = funnel.meetings || { count: 0 };
  const deals = funnel.converted_deals || { count: 0, value_inr: 0 };
  const won = funnel.revenue_won || { count: 0, value_inr: 0 };
  const conv = funnel.conversion_rates || {};

  const tiers = [
    {
      id: "leads",
      label: "Lead Pool (Hot · Warm · Cold)",
      count: totalLeads.count,
      sub: `${fmtINR(totalLeads.value_inr)} est. potential`,
      widthPct: 100,
      clip: "polygon(0% 0%, 100% 0%, 92% 100%, 8% 100%)",
      gradient: "from-[#262262] via-[#264494] to-[#4F46E5]",
      glow: "shadow-[0_10px_24px_-8px_rgba(38,68,148,0.35)]",
      ring: "border-indigo-300/60",
      icon: Users,
      convLabel: conv.lead_to_meeting_pct != null ? `${conv.lead_to_meeting_pct}% → Meetings` : "Stage 1",
    },
    {
      id: "meetings",
      label: "Customer Meetings",
      count: meetings.count,
      sub: "Discovery & Qualification",
      widthPct: 82,
      clip: "polygon(0% 0%, 100% 0%, 90% 100%, 10% 100%)",
      gradient: "from-[#0284C7] via-[#007AFF] to-[#2563EB]",
      glow: "shadow-[0_10px_24px_-8px_rgba(0,122,255,0.35)]",
      ring: "border-sky-300/60",
      icon: Handshake,
      convLabel: conv.meeting_to_deal_pct != null ? `${conv.meeting_to_deal_pct}% → Deals` : "Stage 2",
    },
    {
      id: "deals",
      label: "Converted Deals (Pipeline)",
      count: deals.count,
      sub: fmtINR(deals.value_inr),
      widthPct: 64,
      clip: "polygon(0% 0%, 100% 0%, 88% 100%, 12% 100%)",
      gradient: "from-[#7C3AED] via-[#6D28D9] to-[#903B96]",
      glow: "shadow-[0_10px_24px_-8px_rgba(124,58,237,0.35)]",
      ring: "border-purple-300/60",
      icon: ArrowDown,
      convLabel: conv.deal_to_won_pct != null ? `${conv.deal_to_won_pct}% Win Rate` : "Stage 3",
    },
    {
      id: "won",
      label: "Revenue Won",
      count: won.count,
      sub: fmtINR(won.value_inr),
      widthPct: 48,
      clip: "polygon(0% 0%, 100% 0%, 84% 100%, 16% 100%)",
      gradient: "from-[#059669] via-[#10B981] to-[#0D9488]",
      glow: "shadow-[0_12px_28px_-6px_rgba(16,185,129,0.4)]",
      ring: "border-emerald-300/70",
      icon: Trophy,
      convLabel: conv.overall_lead_to_won_pct != null ? `${conv.overall_lead_to_won_pct}% Overall` : "Closed Won",
    },
  ];

  return (
    <div className="space-y-4" data-testid="funnel-3d">
      {/* Top Hot / Warm / Cold Lead Temperature Pills */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame size={15} className="text-rose-500 animate-pulse" />
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-rose-700">Hot Leads</div>
              <div className="text-xs text-rose-600/90 font-medium">{fmtINR(hot.value_inr)}</div>
            </div>
          </div>
          <span className="text-lg font-extrabold text-rose-700">{hot.count}</span>
        </div>
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sun size={15} className="text-amber-500" />
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-amber-700">Warm Leads</div>
              <div className="text-xs text-amber-700/80 font-medium">{fmtINR(warm.value_inr)}</div>
            </div>
          </div>
          <span className="text-lg font-extrabold text-amber-700">{warm.count}</span>
        </div>
        <div className="rounded-xl bg-sky-50 border border-sky-200 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Snowflake size={15} className="text-sky-500" />
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-sky-700">Cold Leads</div>
              <div className="text-xs text-sky-700/80 font-medium">{fmtINR(cold.value_inr)}</div>
            </div>
          </div>
          <span className="text-lg font-extrabold text-sky-700">{cold.count}</span>
        </div>
      </div>

      {/* 3D Perspective Funnel Layers */}
      <div className="relative py-2 flex flex-col items-center gap-2" style={{ perspective: "900px" }}>
        {tiers.map((t, idx) => {
          const Icon = t.icon;
          const isHot = activeTier === t.id;
          return (
            <div key={t.id} className="w-full flex flex-col items-center">
              <div
                onMouseEnter={() => setActiveTier(t.id)}
                onMouseLeave={() => setActiveTier(null)}
                onClick={() => setActiveTier(isHot ? null : t.id)}
                style={{
                  width: `${t.widthPct}%`,
                  clipPath: t.clip,
                  transform: isHot ? "rotateX(4deg) scale(1.03)" : "rotateX(9deg)",
                }}
                className={`relative cursor-pointer transition-all duration-300 bg-gradient-to-r ${t.gradient} ${t.glow} border-t ${t.ring} px-6 py-3.5 flex items-center justify-between text-white select-none`}
                data-testid={`funnel-tier-${t.id}`}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent" />
                <div className="relative flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                    <Icon size={15} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold tracking-wide truncate">{t.label}</div>
                    <div className="text-[11px] text-white/85 truncate">{t.sub}</div>
                  </div>
                </div>
                <div className="relative text-right shrink-0 pl-2">
                  <div className="text-lg sm:text-xl font-extrabold leading-none">{t.count}</div>
                </div>
              </div>

              {idx < tiers.length - 1 ? (
                <div className="mt-1 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-semibold text-[#264494] tracking-wide">
                  ↓ {t.convLabel}
                </div>
              ) : (
                <div className="mt-1.5 px-3 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700">
                  Overall Conversion: {t.convLabel}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
