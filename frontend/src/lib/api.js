import axios from "axios";

const getApiBase = () => {
  // If running in browser on a remote IP or domain, always use relative /api
  if (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    return "/api";
  }
  const base = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
  return base.endsWith("/api") ? base : `${base}/api`;
};

export const api = axios.create({
  baseURL: getApiBase(),
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("fe_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      if (window.location.pathname !== "/login" && !window.location.pathname.startsWith("/accept-invite") && !window.location.pathname.startsWith("/reset-password")) {
        localStorage.removeItem("fe_token");
      }
    }
    return Promise.reject(error);
  }
);

export const FY = "FY2026-27";

export function errMsg(err) {
  if (!err) return "An unexpected error occurred";
  if (typeof err === "string") return err;
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => (typeof d === "string" ? d : d.msg || JSON.stringify(d))).join(", ");
  }
  if (err?.response?.data?.message) return err.response.data.message;
  if (err.message) return err.message;
  return "An unexpected error occurred";
}

export function fmtINR(val) {
  if (val === null || val === undefined || isNaN(val)) return "—";
  const num = Number(val);
  return "₹" + num.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const MONTH_NAMES = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
};

export function monthLabel(m) {
  if (!m) return "";
  const parts = m.split("-");
  const mo = parts[1] || parts[0];
  return MONTH_NAMES[mo] || mo;
}

export function fmtVal(val, unit = "") {
  if (val === null || val === undefined || val === "") return "—";
  const num = Number(val);
  if (isNaN(num)) return `${val} ${unit}`.trim();
  if (unit === "INR" || unit === "₹") return fmtINR(num);
  if (unit === "%") return `${num}%`;
  return `${num.toLocaleString("en-IN")} ${unit}`.trim();
}

export const STATUS_META = {
  ACHIEVED: { label: "Achieved", cls: "fe-chip-green", color: "#10B981" },
  ON_TRACK: { label: "On Track", cls: "fe-chip-blue", color: "#264494" },
  AT_RISK: { label: "At Risk", cls: "fe-chip-orange", color: "#F19A2F" },
  CRITICAL: { label: "Critical", cls: "fe-chip-red", color: "#EF4444" },
  BELOW_TARGET: { label: "Below Target", cls: "fe-chip-red", color: "#EF4444" },
  NOT_STARTED: { label: "Not Started", cls: "fe-chip-slate", color: "#94A3B8" },
  DRAFT: { label: "Draft", cls: "fe-chip-slate", color: "#94A3B8" },
  SUBMITTED: { label: "Submitted", cls: "fe-chip-yellow", color: "#EAB308" },
  APPROVED: { label: "Approved", cls: "fe-chip-green", color: "#10B981" },
  REJECTED: { label: "Rejected", cls: "fe-chip-red", color: "#EF4444" },
};

export function hasPerm(user, perm) {
  if (!user) return false;
  if (user.is_super_admin) return true;
  return Array.isArray(user.permissions) && user.permissions.includes(perm);
}

export function hasAnyPerm(user, perms) {
  if (!user) return false;
  if (user.is_super_admin) return true;
  if (!Array.isArray(perms) || perms.length === 0) return true;
  const userPerms = new Set(user.permissions || []);
  return perms.some((p) => userPerms.has(p));
}
