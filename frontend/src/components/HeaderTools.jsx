import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Bell, Search } from "lucide-react";

function useOutside(ref, cb) {
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && cb();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, cb]);
}

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const ref = useRef(null);
  const nav = useNavigate();
  useOutside(ref, () => setRes(null));
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const t = setTimeout(() => api.get("/search", { params: { q } }).then((r) => setRes(r.data)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  const groups = res ? [["Leads", res.leads, "/app/leads", (x) => `${x.name} · ${x.company}`], ["Accounts", res.accounts, "/app/accounts", (x) => x.name],
    ["Opportunities", res.opportunities, "/app/opportunities", (x) => `${x.title} · ${x.stage}`], ["People", res.users, "/app/users", (x) => `${x.name} · ${x.designation || ""}`]] : [];
  const total = groups.reduce((s, g) => s + g[1].length, 0);
  return (
    <div className="relative hidden md:block" ref={ref}>
      <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads, accounts, opportunities, people…" className="fe-input pl-8 py-1.5 w-80 text-sm" data-testid="global-search" />
      {res && (
        <div className="absolute z-50 mt-1 w-[26rem] bg-white border border-slate-200 rounded-lg shadow-lg max-h-96 overflow-y-auto" data-testid="global-search-results">
          {total === 0 && <div className="p-4 text-sm text-slate-400">No matches.</div>}
          {groups.filter((g) => g[1].length).map(([label, items, link, fmt]) => (
            <div key={label} className="py-1">
              <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider font-bold text-slate-400">{label}</div>
              {items.map((x) => <button key={x.id} onClick={() => { setRes(null); setQ(""); nav(link); }} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50">{fmt(x)}</button>)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Notifications() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const nav = useNavigate();
  useOutside(ref, () => setOpen(false));
  useEffect(() => {
    const load = () => api.get("/notifications").then((r) => setItems(r.data)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="relative p-2 rounded-md hover:bg-slate-100" data-testid="notifications-btn">
        <Bell size={18} className="text-slate-600" />
        {items.length > 0 && <span className="absolute -top-0.5 -right-0.5 bg-[#E81B90] text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center" data-testid="notifications-count">{items.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-80 bg-white border border-slate-200 rounded-lg shadow-lg" data-testid="notifications-panel">
          <div className="px-4 py-2.5 border-b border-slate-100 text-sm font-semibold text-[#262262]">Notifications</div>
          {items.length === 0 ? <div className="p-4 text-sm text-slate-400">You're all caught up.</div> : items.map((n, i) => (
            <button key={i} onClick={() => { setOpen(false); if (n.id) { api.post(`/notifications/${n.id}/read`).catch(() => {}); setItems((x) => x.filter((y) => y !== n)); } n.link && nav(n.link); }} className="block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-50">
              <span className="fe-chip fe-chip-blue mr-2">{n.type}</span>{n.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
