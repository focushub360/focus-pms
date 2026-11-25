import { todayKey, addDays } from "./utils";

// Prototype events from Automotive Operations PMS demo screenshot (November 2026)
export const AUTOMOTIVE_PROTOTYPE_EVENTS = [
  // 12 Nov
  {
    id: "proto-12-cust-meet",
    title: "Customer meet - Corporate fleet",
    activity_type: "Customer Meeting",
    start_at: "2026-11-12T14:00:00+05:30",
    end_at: "2026-11-12T15:00:00+05:30",
    all_day: false,
    priority: "High",
    status: "Planned",
    location: "Corporate Fleet Boardroom",
    notes: "Review fleet expansion of 15 executive sedans."
  },
  // 14 Nov (Selected Day in prototype screenshot)
  {
    id: "proto-14-test-drive",
    title: "Test drive - S. Kulkarni (Alpha X5)",
    activity_type: "Appointment",
    start_at: "2026-11-14T10:00:00+05:30",
    end_at: "2026-11-14T11:00:00+05:30",
    all_day: false,
    priority: "High",
    status: "Planned",
    location: "Showroom Bay 2",
    notes: "Customer interested in Alpha X5 Luxury trim with AWD."
  },
  {
    id: "proto-14-leads-task",
    title: "Call 15 hot leads",
    activity_type: "Task",
    start_at: "2026-11-14T11:00:00+05:30",
    end_at: "2026-11-14T12:00:00+05:30",
    all_day: false,
    priority: "High",
    status: "Planned",
    metric_current: 6,
    metric_target: 15,
    notes: "Follow up on weekend digital marketing campaign inquiries."
  },
  {
    id: "proto-14-quotation-task",
    title: "Send quotation to P. Menon",
    activity_type: "Task",
    start_at: "2026-11-14T12:00:00+05:30",
    end_at: "2026-11-14T12:30:00+05:30",
    all_day: false,
    priority: "High",
    status: "Planned",
    notes: "Include corporate discount slab and AMC package."
  },
  {
    id: "proto-14-followup-call",
    title: "Follow-up call - P. Menon",
    activity_type: "Follow-up",
    start_at: "2026-11-14T12:30:00+05:30",
    end_at: "2026-11-14T13:00:00+05:30",
    all_day: false,
    priority: "Normal",
    status: "Planned",
    notes: "Confirm receipt of quotation and schedule test drive."
  },
  {
    id: "proto-14-drives-task",
    title: "Complete 4 test drives",
    activity_type: "Task",
    start_at: "2026-11-14T15:00:00+05:30",
    end_at: "2026-11-14T16:00:00+05:30",
    all_day: false,
    priority: "High",
    status: "Planned",
    metric_current: 1,
    metric_target: 4,
    notes: "Pre-booked slots for showroom weekend walk-ins."
  },
  {
    id: "proto-14-crm-task",
    title: "Update CRM notes for yesterday's walk-ins",
    activity_type: "Task",
    start_at: "2026-11-14T17:30:00+05:30",
    end_at: "2026-11-14T18:00:00+05:30",
    all_day: false,
    priority: "Medium",
    status: "Planned",
    notes: "Enter prospect preferences, test drive feedback and budgets."
  },
  {
    id: "proto-14-delivery-task",
    title: "Prepare delivery checklist - T. More",
    activity_type: "Task",
    start_at: "2026-11-14T18:00:00+05:30",
    end_at: "2026-11-14T18:30:00+05:30",
    all_day: false,
    priority: "Low",
    status: "Planned",
    notes: "Inspect PDI clearance, accessory fitment, and registration docs."
  },
  // 15 Nov
  {
    id: "proto-15-del-handover",
    title: "Delivery handover - T. More",
    activity_type: "Appointment",
    start_at: "2026-11-15T11:00:00+05:30",
    end_at: "2026-11-15T12:00:00+05:30",
    all_day: false,
    priority: "High",
    status: "Planned",
    location: "Delivery Bay 1",
    notes: "Key handover ceremony, sweets distribution and vehicle app demo."
  },
  // 16 Nov
  {
    id: "proto-16-walkin-appt",
    title: "Showroom walk-in appointment",
    activity_type: "Appointment",
    start_at: "2026-11-16T14:30:00+05:30",
    end_at: "2026-11-16T15:30:00+05:30",
    all_day: false,
    priority: "Medium",
    status: "Planned",
    notes: "Pre-registered high net worth buyer."
  },
  // 17 Nov
  {
    id: "proto-17-fu-gupta",
    title: "Follow-up - H. Gupta (negotiation)",
    activity_type: "Follow-up",
    start_at: "2026-11-17T16:00:00+05:30",
    end_at: "2026-11-17T16:45:00+05:30",
    all_day: false,
    priority: "High",
    status: "Planned",
    notes: "Final negotiation on exchange bonus and insurance."
  },
  // 19 Nov
  {
    id: "proto-19-target-commit",
    title: "Monthly target commitment: 20 deliveries",
    activity_type: "Task",
    start_at: "2026-11-19T09:30:00+05:30",
    end_at: "2026-11-19T10:30:00+05:30",
    all_day: false,
    priority: "High",
    status: "Planned",
    notes: "Mid-month checkpoint with General Manager."
  },
  // 21 Nov
  {
    id: "proto-21-campaign-rev",
    title: "Campaign review with OEM",
    activity_type: "Meeting",
    start_at: "2026-11-21T15:00:00+05:30",
    end_at: "2026-11-21T16:30:00+05:30",
    all_day: false,
    priority: "High",
    status: "Planned",
    location: "Online / Microsoft Teams",
    notes: "Review lead funnel conversion rate from OEM national ad campaign."
  }
];

// Helper to provide realistic today-relative activities if user browses outside Nov 2026
export function getRelativeDemoEvents(today = todayKey()) {
  const d0 = today;
  const d1 = addDays(today, 1);
  const d2 = addDays(today, 2);
  const d3 = addDays(today, 5);

  return [
    {
      id: `rel-d0-td`,
      title: "Test drive - S. Kulkarni (Alpha X5)",
      activity_type: "Appointment",
      start_at: `${d0}T10:00:00+05:30`,
      end_at: `${d0}T11:00:00+05:30`,
      all_day: false,
      priority: "High",
      status: "Planned",
      location: "Showroom Bay 2",
      notes: "Customer interested in Alpha X5 Luxury trim with AWD."
    },
    {
      id: `rel-d0-leads`,
      title: "Call 15 hot leads",
      activity_type: "Task",
      start_at: `${d0}T11:00:00+05:30`,
      end_at: `${d0}T12:00:00+05:30`,
      all_day: false,
      priority: "High",
      status: "Planned",
      metric_current: 6,
      metric_target: 15,
      notes: "Follow up on weekend digital marketing campaign inquiries."
    },
    {
      id: `rel-d0-quote`,
      title: "Send quotation to P. Menon",
      activity_type: "Task",
      start_at: `${d0}T12:00:00+05:30`,
      end_at: `${d0}T12:30:00+05:30`,
      all_day: false,
      priority: "High",
      status: "Planned",
      notes: "Include corporate discount slab and AMC package."
    },
    {
      id: `rel-d0-fu`,
      title: "Follow-up call - P. Menon",
      activity_type: "Follow-up",
      start_at: `${d0}T12:30:00+05:30`,
      end_at: `${d0}T13:00:00+05:30`,
      all_day: false,
      priority: "Normal",
      status: "Planned",
      notes: "Confirm receipt of quotation and schedule test drive."
    },
    {
      id: `rel-d0-drives`,
      title: "Complete 4 test drives",
      activity_type: "Task",
      start_at: `${d0}T15:00:00+05:30`,
      end_at: `${d0}T16:00:00+05:30`,
      all_day: false,
      priority: "High",
      status: "Planned",
      metric_current: 1,
      metric_target: 4,
      notes: "Pre-booked slots for showroom weekend walk-ins."
    },
    {
      id: `rel-d0-crm`,
      title: "Update CRM notes for yesterday's walk-ins",
      activity_type: "Task",
      start_at: `${d0}T17:30:00+05:30`,
      end_at: `${d0}T18:00:00+05:30`,
      all_day: false,
      priority: "Medium",
      status: "Planned",
      notes: "Enter prospect preferences, test drive feedback and budgets."
    },
    {
      id: `rel-d0-delivery`,
      title: "Prepare delivery checklist - T. More",
      activity_type: "Task",
      start_at: `${d0}T18:00:00+05:30`,
      end_at: `${d0}T18:30:00+05:30`,
      all_day: false,
      priority: "Low",
      status: "Planned",
      notes: "Inspect PDI clearance, accessory fitment, and registration docs."
    },
    {
      id: `rel-d1-handover`,
      title: "Delivery handover - T. More",
      activity_type: "Appointment",
      start_at: `${d1}T11:00:00+05:30`,
      end_at: `${d1}T12:00:00+05:30`,
      all_day: false,
      priority: "High",
      status: "Planned"
    },
    {
      id: `rel-d2-walkin`,
      title: "Showroom walk-in appointment",
      activity_type: "Appointment",
      start_at: `${d2}T14:30:00+05:30`,
      end_at: `${d2}T15:30:00+05:30`,
      all_day: false,
      priority: "Medium",
      status: "Planned"
    },
    {
      id: `rel-d3-target`,
      title: "Monthly target commitment: 20 deliveries",
      activity_type: "Task",
      start_at: `${d3}T10:00:00+05:30`,
      end_at: `${d3}T11:00:00+05:30`,
      all_day: false,
      priority: "High",
      status: "Planned"
    }
  ];
}
