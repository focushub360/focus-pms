import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Bell, Search, X } from "lucide-react";

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
  const [mobileOpen, setMobileOpen] = useState(false);
  const ref = useRef(null);
  const mobileRef = useRef(null);
  const inputRef = useRef(null);
  const nav = useNavigate();

  useOutside(ref, () => setRes(null));
  useOutside(mobileRef, () => setMobileOpen(false));

  useEffect(() => {
    if (q.trim().length < 2) {
      setRes(null);
      return;
    }
    const t = setTimeout(() => {
      api.get("/search", { params: { q } }).then((r) => setRes(r.data)).catch(() => { });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const groups = res
    ? [
      ["Leads", res.leads, "/app/leads", (x) => `${x.name} · ${x.company}`],
      ["Accounts", res.accounts, "/app/accounts", (x) => x.name],
      ["Opportunities", res.opportunities, "/app/opportunities", (x) => `${x.title} · ${x.stage}`],
      ["People", res.users, "/app/users", (x) => `${x.name} · ${x.designation || ""}`],
    ]
    : [];
  const total = groups.reduce((s, g) => s + g[1].length, 0);

  const handleSelect = (link) => {
    setRes(null);
    setQ("");
    setMobileOpen(false);
    nav(link);
  };

  return (
    <>
      {/* Mobile search trigger icon */}
      <button
        onClick={() => {
          setMobileOpen(true);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        className="md:hidden p-2 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
        aria-label="Search"
      >
        <Search size={19} />
      </button>

      {/* Mobile search modal backdrop & popup */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-3 pt-6 md:hidden">
          <div ref={mobileRef} className="w-full max-w-lg bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden">
            <div className="flex items-center gap-2 p-3.5 border-b border-slate-200/70">
              <Search size={18} className="text-slate-400 shrink-0 ml-1" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search leads, opportunities, accounts..."
                className="w-full text-sm outline-none bg-transparent placeholder:text-slate-400 text-slate-800 font-medium"
              />
              {q ? (
                <button onClick={() => setQ("")} className="p-1 rounded-md text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              ) : null}
              <button onClick={() => setMobileOpen(false)} className="text-xs font-semibold text-slate-600 px-2 py-1">
                Cancel
              </button>
            </div>
            {res && (
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {total === 0 ? (
                  <div className="p-4 text-sm text-center text-slate-400">No matches found.</div>
                ) : (
                  groups
                    .filter((g) => g[1].length)
                    .map(([label, items, link, fmt]) => (
                      <div key={label} className="py-2">
                        <div className="px-3 pb-1 text-[10px] uppercase tracking-wider font-bold text-slate-400">{label}</div>
                        {items.map((x) => (
                          <button
                            key={x.id}
                            onClick={() => handleSelect(link)}
                            className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50 text-slate-700"
                          >
                            {fmt(x)}
                          </button>
                        ))}
                      </div>
                    ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Desktop / Tablet inline search bar */}
      <div className="relative hidden md:block" ref={ref}>
        <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search leads, accounts, opportunities, people…"
          className="fe-input pl-9 py-1.5 w-64 lg:w-80 text-sm transition-all focus:w-80 lg:focus:w-96 rounded-2xl bg-slate-100/70 focus:bg-white border-transparent focus:border-[#007AFF]"
          data-testid="global-search"
        />
        {res && (
          <div className="absolute z-50 mt-2 w-[26rem] bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-2xl max-h-96 overflow-y-auto fe-scroll" data-testid="global-search-results">
            {total === 0 && <div className="p-4 text-sm text-slate-400 text-center">No matches found.</div>}
            {groups
              .filter((g) => g[1].length)
              .map(([label, items, link, fmt]) => (
                <div key={label} className="py-1.5">
                  <div className="px-3.5 pt-2 pb-1 text-[10px] uppercase tracking-wider font-bold text-slate-400">{label}</div>
                  {items.map((x) => (
                    <button
                      key={x.id}
                      onClick={() => {
                        setRes(null);
                        setQ("");
                        nav(link);
                      }}
                      className="block w-full text-left px-3.5 py-2 text-sm hover:bg-slate-50 text-slate-700 transition-colors rounded-xl mx-1"
                    >
                      {fmt(x)}
                    </button>
                  ))}
                </div>
              ))}
          </div>
        )}
      </div>
    </>
  );
}

export function Notifications() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const nav = useNavigate();
  useOutside(ref, () => setOpen(false));

  useEffect(() => {
    const load = () => api.get("/notifications").then((r) => setItems(r.data)).catch(() => { });
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-2xl hover:bg-slate-100 transition-all text-slate-600 active:scale-95"
        data-testid="notifications-btn"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {items.length > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 bg-gradient-to-r from-[#FF2D55] to-[#E81B90] text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center shadow-xs"
            data-testid="notifications-count"
          >
            {items.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 sm:w-80 bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-2xl overflow-hidden" data-testid="notifications-panel">
          <div className="px-4 py-3 border-b border-slate-100/90 text-sm font-semibold text-[#262262] flex items-center justify-between">
            <span className="font-bold">Notifications</span>
            {items.length > 0 && <span className="text-xs text-blue-600 font-semibold">{items.length} new</span>}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-4 text-sm text-center text-slate-400">You're all caught up.</div>
            ) : (
              items.map((n, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setOpen(false);
                    if (n.id) {
                      api.post(`/notifications/${n.id}/read`).catch(() => { });
                      setItems((x) => x.filter((y) => y !== n));
                    }
                    n.link && nav(n.link);
                  }}
                  className="block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-50 transition-colors"
                >
                  <span className="fe-chip fe-chip-blue mr-2 text-[10px]">{n.type}</span>
                  <span className="text-slate-700">{n.title}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
