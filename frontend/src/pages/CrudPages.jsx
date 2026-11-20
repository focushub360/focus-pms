import { makeCrudPage } from "./_crud";
import ConvertLead from "@/components/ConvertLead";

export const Leads = makeCrudPage({
  title: "Leads", subtitle: "Prospective customers in your pipeline.", endpoint: "/leads", perm: "SALES_LEAD_MANAGE",
  testid: "leads-page",
  headers: ["Lead ID", "Name", "Company", "Status", "Source", "Owner", "Email", ""],
  defaultForm: { name: "", company: "", email: "", phone: "", source: "Outbound", campaign_id: "", status: "New", owner_id: "", notes: "" },
  fields: [
    { key: "name", label: "Lead Name", required: true },
    { key: "company", label: "Company", required: true },
    { key: "email", label: "Email", type: "email" },
    { key: "phone", label: "Phone" },
    { key: "source", label: "Source", type: "select", options: ["Outbound", "Inbound", "Referral", "Campaign", "Event"] },
    { key: "status", label: "Status", type: "select", options: ["New", "Contacted", "Qualified", "Converted", "Disqualified"] },
    { key: "owner_id", label: "Owner", type: "users" },
    { key: "notes", label: "Notes", full: true },
  ],
  rowRender: (r, users, reload) => (
    <tr key={r.id} data-testid={`lead-${r.id}`}>
      <td className="text-xs text-slate-500">{r.lead_code || "—"}</td>
      <td className="font-semibold">{r.name}</td><td>{r.company}</td>
      <td><span className="fe-chip fe-chip-blue">{r.status}</span></td>
      <td>{r.source}</td>
      <td>{users.find((u) => u.id === r.owner_id)?.name || "—"}</td>
      <td className="text-xs">{r.email || "—"}</td>
      <td><ConvertLead lead={r} onDone={reload} /></td>
    </tr>
  ),
});

export const Accounts = makeCrudPage({
  title: "Accounts", subtitle: "Customer accounts and decision-makers.", endpoint: "/accounts", perm: "SALES_ACCOUNT_MANAGE",
  testid: "accounts-page",
  headers: ["Account", "Industry", "City", "Primary Contact", "Owner"],
  defaultForm: { name: "", industry: "", city: "", primary_contact: "", primary_contact_email: "", primary_contact_phone: "", owner_id: "" },
  fields: [
    { key: "name", label: "Account Name", required: true },
    { key: "industry", label: "Industry" },
    { key: "city", label: "City" },
    { key: "primary_contact", label: "Primary Contact" },
    { key: "primary_contact_email", label: "Contact Email", type: "email" },
    { key: "primary_contact_phone", label: "Contact Phone" },
    { key: "owner_id", label: "Owner", type: "users" },
  ],
  rowRender: (r, users) => (
    <tr key={r.id} data-testid={`account-${r.id}`}>
      <td className="font-semibold">{r.name}</td><td>{r.industry}</td><td>{r.city}</td>
      <td>{r.primary_contact}</td>
      <td>{users.find((u) => u.id === r.owner_id)?.name || "—"}</td>
    </tr>
  ),
});

export const Campaigns = makeCrudPage({
  title: "Marketing Campaigns", subtitle: "Plan, run and track campaigns with budget and spend.", endpoint: "/campaigns", perm: "MARKETING_CAMPAIGN_MANAGE",
  testid: "campaigns-page",
  headers: ["Campaign", "Channel", "Status", "Budget", "Spend", "Owner", "Dates"],
  defaultForm: { name: "", channel: "Email", status: "Planned", budget_inr: 0, spend_inr: 0, start_date: "", end_date: "", owner_id: "", notes: "" },
  fields: [
    { key: "name", label: "Campaign Name", required: true },
    { key: "channel", label: "Channel", type: "select", options: ["Email", "LinkedIn", "Trade Show", "Content", "Webinar", "Paid Ads", "Other"] },
    { key: "status", label: "Status", type: "select", options: ["Planned", "Running", "Completed", "Paused"] },
    { key: "budget_inr", label: "Budget (INR)", type: "number" },
    { key: "spend_inr", label: "Spend (INR)", type: "number" },
    { key: "start_date", label: "Start Date", type: "date" },
    { key: "end_date", label: "End Date", type: "date" },
    { key: "owner_id", label: "Owner", type: "users" },
    { key: "notes", label: "Notes", full: true },
  ],
  rowRender: (r, users) => (
    <tr key={r.id} data-testid={`campaign-${r.id}`}>
      <td className="font-semibold">{r.name}</td><td>{r.channel}</td>
      <td><span className="fe-chip fe-chip-cyan">{r.status}</span></td>
      <td>₹{Number(r.budget_inr).toLocaleString("en-IN")}</td>
      <td>₹{Number(r.spend_inr).toLocaleString("en-IN")}</td>
      <td>{users.find((u) => u.id === r.owner_id)?.name || "—"}</td>
      <td className="text-xs">{r.start_date?.slice(0,10) || "—"} → {r.end_date?.slice(0,10) || "—"}</td>
    </tr>
  ),
});
