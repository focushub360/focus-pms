import { useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { Panel, Loading, Empty, Select } from "@/components/dash/ui";
import { todayKey } from "@/components/calendar/utils";
import { toast } from "sonner";

const fmt = (v) => (typeof v === "number" ? v.toLocaleString("en-IN") : v ?? "—");
const FY_MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"];

export default function Reports() {
  const [list, setList] = useState(null);
  const [emps, setEmps] = useState([]);
  const [f, setF] = useState({ name: "sales-performance", start: "2026-04-01", end: todayKey(), employee: "", stage: "", service: "", month: "", kpi_status: "", submission_status: "" });
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get("/reports").then((r) => setList(r.data));
    api.get("/meta/employees").then((r) => setEmps(r.data)).catch(() => {});
  }, []);
  const isKpiReport = f.name.startsWith("kpi-") && f.name !== "kpi-scorecards";
  const params = () => ({
    start: f.start, end: f.end,
    employee: f.employee || undefined, stage: f.stage || undefined, service: f.service || undefined,
    month: f.month || undefined, kpi_status: f.kpi_status || undefined, submission_status: f.submission_status || undefined,
  });
  const run = () => { setData(null); api.get(`/reports/${f.name}`, { params: params() }).then((r) => setData(r.data)).catch((e) => { toast.error(errMsg(e)); setData({ rows: [], columns: [] }); }); };
  useEffect(() => { if (list) run(); }, [list, f.name]); // eslint-disable-line
  const exp = async (format) => {
    try {
      const r = await api.get(`/reports/${f.name}`, { params: { ...params(), format }, responseType: "blob" });
      const u = URL.createObjectURL(r.data); const a = document.createElement("a"); a.href = u; a.download = `${f.name}_${f.start}_${f.end}.${format}`; a.click(); URL.revokeObjectURL(u);
    } catch (e) { toast.error(errMsg(e)); }
  };
  if (!list) return <Loading />;
  const set = (k) => (v) => setF({ ...f, [k]: v?.target ? v.target.value : v });
  return (
    <div className="space-y-5" data-testid="reports-page">
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-[#262262]">Reports &amp; Analytics</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">{list.detail_scope ? "Detailed team reports from live records." : "Your detailed figures plus department totals, from live records."}</p>
      </div>
      <Panel>
        <div className="flex flex-wrap items-end gap-2.5 sm:gap-3">
          <Select value={f.name} onChange={set("name")} testid="report-type" options={list.reports.map((r) => ({ value: r.id, label: r.name }))} />
          <label className="text-xs text-slate-500">From<input type="date" className="fe-input py-1.5 block mt-0.5" value={f.start} onChange={set("start")} data-testid="report-start" /></label>
          <label className="text-xs text-slate-500">To<input type="date" className="fe-input py-1.5 block mt-0.5" value={f.end} onChange={set("end")} data-testid="report-end" /></label>
          {list.detail_scope && <Select value={f.employee} onChange={set("employee")} testid="report-employee" options={[{ value: "", label: "All employees" }, ...emps.map((e) => ({ value: e.id, label: e.name }))]} />}
          {isKpiReport ? (
            <>
              <Select value={f.month} onChange={set("month")} testid="report-month" options={[{ value: "", label: "All months" }, ...FY_MONTHS.map((m) => ({ value: m, label: m }))]} />
              <Select value={f.kpi_status} onChange={set("kpi_status")} testid="report-kpi-status" options={[{ value: "", label: "All KPI statuses" }, "On Track", "Watch", "At Risk", "Pending", "Deactive"].map((s) => typeof s === "string" ? { value: s, label: s } : s)} />
              <Select value={f.submission_status} onChange={set("submission_status")} testid="report-sub-status" options={[{ value: "", label: "All submissions" }, "DRAFT", "SUBMITTED", "APPROVED", "RETURNED"].map((s) => typeof s === "string" ? { value: s, label: s } : s)} />
            </>
          ) : (
            <>
              <input className="fe-input py-1.5 w-32 sm:w-36" placeholder="Stage" value={f.stage} onChange={set("stage")} data-testid="report-stage" />
              <input className="fe-input py-1.5 w-36 sm:w-40" placeholder="Service category" value={f.service} onChange={set("service")} data-testid="report-service" />
            </>
          )}
          <button className="fe-btn-primary text-sm shadow-xs" onClick={run} data-testid="report-run">Apply</button>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 sm:ml-auto w-full sm:w-auto mt-2 sm:mt-0">
            {["xlsx", "csv", "pdf"].map((x) => <button key={x} className="fe-btn-secondary text-xs uppercase" onClick={() => exp(x)} data-testid={`report-export-${x}`}>{x === "xlsx" ? "Excel" : x}</button>)}
          </div>
        </div>
      </Panel>
      <Panel title={data?.title}>
        {!data ? <Loading /> : data.rows.length ? (
          <div className="overflow-x-auto"><table className="fe-table" data-testid="report-table"><thead><tr>{data.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
            <tbody>{data.rows.map((r, i) => <tr key={i} className={i === data.rows.length - 1 && Object.values(r)[0] === "Department total" ? "font-semibold bg-slate-50" : ""}>{data.columns.map((c) => <td key={c.key}>{fmt(r[c.key])}</td>)}</tr>)}</tbody></table></div>
        ) : <Empty text="No records for these filters." />}
      </Panel>
    </div>
  );
}
