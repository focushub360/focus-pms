import { fmtVal, STATUS_META } from "@/lib/api";
import { StatusChip, Empty } from "./ui";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts";

const CAT_LABEL = {
  SALES_PERFORMANCE: "Sales Performance", LEAD_PROSPECT: "Lead Generation", CUSTOMER_ENGAGEMENT: "Customer Engagement",
  PROPOSAL_CONVERSION: "Proposal & Conversion", REVENUE_COMMERCIAL: "Revenue & Commercial", FUNC_OPS: "Functional · Operations",
  FUNC_MIS: "Functional · MIS", FUNC_MARKETING: "Functional · Marketing", FUNC_BD: "Functional · Business Development", FUNC_HOD: "Functional · HOD",
};
export const catLabel = (c) => CAT_LABEL[c] || c;

export function KpiAchievementChart({ items }) {
  const data = items.filter((i) => i.achievement_pct !== null).map((i) => ({ name: i.kpi_name, pct: i.achievement_pct, status: i.status }));
  if (!data.length) return <Empty text="No KPI has both a target and an actual yet." hint="Targets appear here once management approves them." />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 30)}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} unit="%" />
        <YAxis type="category" dataKey="name" width={190} tick={{ fontSize: 11, fill: "#475569" }} />
        <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontSize: 12 }} />
        <Bar dataKey="pct" name="Achievement" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => <Cell key={i} fill={(STATUS_META[d.status] || {}).color || "#264494"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ScorecardTable({ items, onEnterActual, canEnter, testid = "scorecard-table", functionalOnly = false }) {
  const rows = functionalOnly ? items.filter((i) => i.category.startsWith("FUNC_")) : items;
  if (!rows.length) return <Empty text="No KPIs assigned." />;
  const groups = rows.reduce((a, i) => ((a[i.category] = a[i.category] || []).push(i), a), {});
  return (
    <div className="overflow-x-auto">
      <table className="fe-table" data-testid={testid}>
        <thead>
          <tr><th>KPI</th><th>Freq.</th><th>Source</th><th className="text-right">Target</th><th className="text-right">Actual</th>
            <th className="text-right">Ach. %</th><th className="text-right">Weight</th><th className="text-right">Score</th><th>Status</th><th>Updated</th>{canEnter && <th></th>}</tr>
        </thead>
        <tbody>
          {Object.entries(groups).map(([cat, list]) => [
            <tr key={cat}><td colSpan={canEnter ? 11 : 10} className="!bg-slate-50 !py-2 text-xs font-bold uppercase tracking-wider text-[#264494]">{catLabel(cat)}</td></tr>,
            ...list.map((i) => (
              <tr key={i.assignment_id} data-testid={`kpi-row-${i.kpi_code}`}>
                <td><div className="font-medium text-slate-800">{i.kpi_name}</div><div className="text-[11px] text-slate-400">{i.formula}</div></td>
                <td className="text-xs">{i.frequency}</td>
                <td><span className={`fe-chip ${i.data_source === "SYSTEM" ? "fe-chip-cyan" : "fe-chip-purple"}`}>{i.data_source === "SYSTEM" ? "Auto" : "Manual"}</span></td>
                <td className="text-right">{fmtVal(i.target, i.unit)}</td>
                <td className="text-right font-semibold">{fmtVal(i.actual, i.unit)}{i.actual_status === "SUBMITTED" && <div className="text-[10px] text-orange-600">awaiting validation</div>}</td>
                <td className="text-right">{i.achievement_pct === null ? "—" : `${i.achievement_pct}%`}</td>
                <td className="text-right">{i.weightage ?? "—"}</td>
                <td className="text-right">{i.weighted_score ?? "—"}</td>
                <td><StatusChip status={i.status} /></td>
                <td className="text-xs text-slate-500">{i.last_updated ? new Date(i.last_updated).toLocaleDateString("en-IN") : "—"}</td>
                {canEnter && <td>{i.data_source === "MANUAL" && <button className="text-xs text-[#264494] hover:underline" onClick={() => onEnterActual(i)} data-testid={`enter-actual-${i.kpi_code}`}>Update actual</button>}</td>}
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}
