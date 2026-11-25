const TZ = "Asia/Kolkata";
export const todayKey = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
export const keyOf = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
export const timeOf = (iso) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
export const hourOf = (iso) => { const [h, m] = new Date(iso).toLocaleTimeString("en-GB", { timeZone: TZ, hour12: false }).split(":"); return Number(h) + Number(m) / 60; };
const parse = (k) => { const [y, m, d] = (k || todayKey()).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmt = (dt) => dt.toISOString().slice(0, 10);
export const addDays = (k, n) => { const d = parse(k); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
export const addMonths = (k, n) => { const d = parse(k); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return fmt(d); };
export const weekStart = (k) => addDays(k, -((parse(k).getUTCDay() + 6) % 7));
export const weekStartSun = (k) => addDays(k, -parse(k).getUTCDay());
export const monthStart = (k) => `${k.slice(0, 7)}-01`;
export const monthEnd = (k) => addDays(addMonths(monthStart(k), 1), -1);
export const dayNum = (k) => Number(k.slice(8));
export const label = (k, opts) => parse(k).toLocaleDateString("en-IN", { timeZone: "UTC", ...opts });
export const formatDayHeader = (k) => {
  const d = parse(k);
  const weekday = d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });
  const month = d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short" });
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  return `${weekday} ${month} ${day} ${year}`;
};
export const toLocalInput = (iso) => { const d = new Date(iso); return `${keyOf(iso)}T${d.toLocaleTimeString("en-GB", { timeZone: TZ, hour12: false }).slice(0, 5)}`; };
export const fromLocalInput = (v) => `${v}:00+05:30`;

export function monthGrid(k) {
  const start = weekStart(monthStart(k));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function monthGridSun(k) {
  const start = weekStartSun(monthStart(k));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function rangeFor(view, k) {
  if (view === "year") return [`${k.slice(0, 4)}-01-01`, `${k.slice(0, 4)}-12-31`];
  if (view === "month") { const g = monthGridSun(k); return [g[0], g[41]]; }
  if (view === "week") return [weekStartSun(k), addDays(weekStartSun(k), 6)];
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
  if (view === "week") { const s = weekStartSun(k); return `${label(s, { day: "numeric", month: "short" })} – ${label(addDays(s, 6), { day: "numeric", month: "short", year: "numeric" })}`; }
  if (view === "agenda") return `${label(k, { day: "numeric", month: "short" })} – ${label(addDays(k, 30), { day: "numeric", month: "short", year: "numeric" })}`;
  return label(k, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export const TYPE_COLORS = {
  Meeting: "#818CF8",
  "Customer Meeting": "#38BDF8",
  "Sales Call": "#34D399",
  "Follow-up": "#60A5FA",
  Task: "#FBBF24",
  Appointment: "#2DD4BF",
  "Project Deadline": "#F87171",
  Reminder: "#A78BFA",
  Busy: "#94A3B8",
};

export const TYPE_BADGE_CLASSES = {
  Appointment: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  Task: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "Follow-up": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  Meeting: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  "Customer Meeting": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "Sales Call": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "Project Deadline": "bg-rose-500/20 text-rose-300 border-rose-500/30",
  Reminder: "bg-purple-500/20 text-purple-300 border-purple-500/30",
};

export const eventsOn = (events, k) => (events || []).filter((e) => keyOf(e.start_at) <= k && keyOf(e.end_at) >= k)
  .sort((a, b) => a.start_at.localeCompare(b.start_at));
