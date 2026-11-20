const TZ = "Asia/Kolkata";
export const todayKey = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
export const keyOf = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
export const timeOf = (iso) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
export const hourOf = (iso) => { const [h, m] = new Date(iso).toLocaleTimeString("en-GB", { timeZone: TZ, hour12: false }).split(":"); return Number(h) + Number(m) / 60; };
const parse = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmt = (dt) => dt.toISOString().slice(0, 10);
export const addDays = (k, n) => { const d = parse(k); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
export const addMonths = (k, n) => { const d = parse(k); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return fmt(d); };
export const weekStart = (k) => addDays(k, -((parse(k).getUTCDay() + 6) % 7));
export const monthStart = (k) => `${k.slice(0, 7)}-01`;
export const monthEnd = (k) => addDays(addMonths(monthStart(k), 1), -1);
export const dayNum = (k) => Number(k.slice(8));
export const label = (k, opts) => parse(k).toLocaleDateString("en-IN", { timeZone: "UTC", ...opts });
export const toLocalInput = (iso) => { const d = new Date(iso); return `${keyOf(iso)}T${d.toLocaleTimeString("en-GB", { timeZone: TZ, hour12: false }).slice(0, 5)}`; };
export const fromLocalInput = (v) => `${v}:00+05:30`;

export function monthGrid(k) {
  const start = weekStart(monthStart(k));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function rangeFor(view, k) {
  if (view === "year") return [`${k.slice(0, 4)}-01-01`, `${k.slice(0, 4)}-12-31`];
  if (view === "month") { const g = monthGrid(k); return [g[0], g[41]]; }
  if (view === "week") return [weekStart(k), addDays(weekStart(k), 6)];
  if (view === "day") return [k, k];
  return [k, addDays(k, 30)];
}

export function step(view, k, dir) {
  if (view === "year") return addMonths(k, 12 * dir);
  if (view === "month") return addMonths(k, dir);
  if (view === "week") return addDays(k, 7 * dir);
  if (view === "agenda") return addDays(k, 30 * dir);
  return addDays(k, dir);
}

export function title(view, k) {
  if (view === "year") return k.slice(0, 4);
  if (view === "month") return label(k, { month: "long", year: "numeric" });
  if (view === "week") { const s = weekStart(k); return `${label(s, { day: "numeric", month: "short" })} – ${label(addDays(s, 6), { day: "numeric", month: "short", year: "numeric" })}`; }
  if (view === "agenda") return `${label(k, { day: "numeric", month: "short" })} – ${label(addDays(k, 30), { day: "numeric", month: "short", year: "numeric" })}`;
  return label(k, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export const TYPE_COLORS = {
  Meeting: "#264494", "Customer Meeting": "#0E7A95", "Sales Call": "#10B981", "Follow-up": "#F19A2F",
  Task: "#6B2470", "Project Deadline": "#EF4444", Reminder: "#64748B", Busy: "#94A3B8",
};

export const eventsOn = (events, k) => events.filter((e) => keyOf(e.start_at) <= k && keyOf(e.end_at) >= k)
  .sort((a, b) => a.start_at.localeCompare(b.start_at));
