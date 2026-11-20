"""Focus PMS — Comprehensive KPI Library catalog (Phase 1 foundation).
Seeded by startup; do NOT populate targets or actuals — those are approved by management."""

# category_code, category_label, [(code, name, unit, formula, frequency, applicable_role_codes)]
KPI_CATEGORIES = [
    ("SALES_PERFORMANCE", "Sales Performance"),
    ("LEAD_PROSPECT", "Lead Generation & Prospecting"),
    ("CUSTOMER_ENGAGEMENT", "Customer Engagement"),
    ("PROPOSAL_CONVERSION", "Proposal & Conversion"),
    ("REVENUE_COMMERCIAL", "Revenue & Commercial"),
    ("FUNC_OPS", "Functional — Operations (Kiran)"),
    ("FUNC_MIS", "Functional — MIS (Vijay)"),
    ("FUNC_MARKETING", "Functional — Creative & Marketing (Satvinder)"),
    ("FUNC_BD", "Functional — Business Development (Kabir/Kriti/Mounika)"),
    ("FUNC_HOD", "Functional — Head of Department (Manoj)"),
]

# role_codes that all sales contributors share
ALL_SALES = ["SALES_MARKETING_CONTRIBUTOR", "MARKETING_MANAGER", "MIS_BUSINESS_ANALYST", "OPERATIONS_COORDINATOR", "HEAD_OF_DEPARTMENT"]

KPI_DEFINITIONS = [
    # ── Sales Performance (all seven contributors) ──
    ("SP_INDIV_TARGET", "Individual Sales Target", "SALES_PERFORMANCE", "INR", "Management-approved target value", "ANNUAL", ALL_SALES),
    ("SP_CONF_SALES", "Confirmed Sales Achievement", "SALES_PERFORMANCE", "INR", "Confirmed order value credited to employee", "MONTHLY", ALL_SALES),
    ("SP_TARGET_ACH_PCT", "Target Achievement %", "SALES_PERFORMANCE", "%", "Confirmed sales / target × 100", "MONTHLY", ALL_SALES),
    ("SP_NEW_LEADS", "New Leads Generated", "SALES_PERFORMANCE", "count", "Count of unique leads", "MONTHLY", ALL_SALES),
    ("SP_QUAL_LEADS", "Qualified Leads", "SALES_PERFORMANCE", "count", "Count of qualified leads", "MONTHLY", ALL_SALES),
    ("SP_MEETINGS", "Customer Meetings", "SALES_PERFORMANCE", "count", "Completed customer meetings", "MONTHLY", ALL_SALES),
    ("SP_CALLS", "Customer Calls", "SALES_PERFORMANCE", "count", "Completed customer calls", "MONTHLY", ALL_SALES),
    ("SP_PROP_SUB", "Proposals Submitted", "SALES_PERFORMANCE", "count", "Number of proposals submitted", "MONTHLY", ALL_SALES),
    ("SP_PROP_VAL", "Proposal Value", "SALES_PERFORMANCE", "INR", "Total value of submitted proposals", "MONTHLY", ALL_SALES),
    ("SP_OPP_CREATED", "Opportunities Created", "SALES_PERFORMANCE", "count", "Number of opportunities created", "MONTHLY", ALL_SALES),
    ("SP_PIPE_VAL", "Active Pipeline Value", "SALES_PERFORMANCE", "INR", "Value of open qualified opportunities", "MONTHLY", ALL_SALES),
    ("SP_OPP_WON", "Opportunities Won", "SALES_PERFORMANCE", "count", "Confirmed wins", "MONTHLY", ALL_SALES),
    ("SP_OPP_LOST", "Opportunities Lost", "SALES_PERFORMANCE", "count", "Number of losses", "MONTHLY", ALL_SALES),
    ("SP_WON_VAL", "Won Business Value", "SALES_PERFORMANCE", "INR", "Confirmed order value", "MONTHLY", ALL_SALES),
    ("SP_L2O_CONV", "Lead → Opportunity Conversion", "SALES_PERFORMANCE", "%", "Opportunities / eligible leads × 100", "MONTHLY", ALL_SALES),
    ("SP_PROP_CONV", "Proposal Conversion Rate", "SALES_PERFORMANCE", "%", "Won opportunities / eligible proposals × 100", "MONTHLY", ALL_SALES),
    ("SP_FU_COMP", "Follow-up Compliance", "SALES_PERFORMANCE", "%", "Follow-ups completed on time / due × 100", "WEEKLY", ALL_SALES),
    ("SP_AVG_DEAL", "Average Deal Value", "SALES_PERFORMANCE", "INR", "Won value / won opportunities", "QUARTERLY", ALL_SALES),
    ("SP_CYCLE_DAYS", "Sales Cycle Duration", "SALES_PERFORMANCE", "days", "Avg days qualification → win", "QUARTERLY", ALL_SALES),
    ("SP_LOST_DOC", "Lost Opportunity Documentation", "SALES_PERFORMANCE", "%", "Lost opps with recorded reason / lost opps × 100", "MONTHLY", ALL_SALES),

    # ── Lead Generation & Prospecting ──
    ("LP_PROSPECTS", "Total Prospects Identified", "LEAD_PROSPECT", "count", "Unique prospects added", "MONTHLY", ALL_SALES),
    ("LP_NEW_REG", "New Leads Registered", "LEAD_PROSPECT", "count", "Leads registered in month", "MONTHLY", ALL_SALES),
    ("LP_QUAL_GEN", "Qualified Leads Generated", "LEAD_PROSPECT", "count", "Qualified leads", "MONTHLY", ALL_SALES),
    ("LP_OUTBOUND", "Outbound Prospecting Activities", "LEAD_PROSPECT", "count", "Outbound touches", "WEEKLY", ALL_SALES),
    ("LP_REFERRAL", "Referral Leads", "LEAD_PROSPECT", "count", "Leads from referral source", "MONTHLY", ALL_SALES),
    ("LP_INBOUND", "Inbound Leads", "LEAD_PROSPECT", "count", "Leads from inbound channels", "MONTHLY", ALL_SALES),
    ("LP_LINKEDIN", "LinkedIn Leads", "LEAD_PROSPECT", "count", "Leads from LinkedIn", "MONTHLY", ALL_SALES),
    ("LP_EMAIL", "Email Leads", "LEAD_PROSPECT", "count", "Leads from email outreach", "MONTHLY", ALL_SALES),
    ("LP_CAMPAIGN", "Campaign Leads", "LEAD_PROSPECT", "count", "Leads attributed to campaigns", "MONTHLY", ALL_SALES),
    ("LP_QUAL_PCT", "Lead Qualification %", "LEAD_PROSPECT", "%", "Qualified / eligible leads × 100", "MONTHLY", ALL_SALES),
    ("LP_RESPONSE_T", "Lead Response Time", "LEAD_PROSPECT", "hours", "Avg time to first response", "WEEKLY", ALL_SALES),
    ("LP_L2M", "Lead → Meeting Conversion", "LEAD_PROSPECT", "%", "Meetings held / qualified leads × 100", "MONTHLY", ALL_SALES),

    # ── Customer Engagement ──
    ("CE_CALLS", "Customer Calls Completed", "CUSTOMER_ENGAGEMENT", "count", "Calls logged completed", "WEEKLY", ALL_SALES),
    ("CE_MTG_DONE", "Customer Meetings Completed", "CUSTOMER_ENGAGEMENT", "count", "Meetings marked completed", "WEEKLY", ALL_SALES),
    ("CE_MTG_SCH", "Meetings Scheduled", "CUSTOMER_ENGAGEMENT", "count", "Meetings scheduled", "WEEKLY", ALL_SALES),
    ("CE_MTG_ATT", "Meetings Attended", "CUSTOMER_ENGAGEMENT", "count", "Meetings attended", "WEEKLY", ALL_SALES),
    ("CE_DISCOVERY", "Discovery Sessions Completed", "CUSTOMER_ENGAGEMENT", "count", "Discovery sessions", "MONTHLY", ALL_SALES),
    ("CE_REQ_DOCS", "Requirement Documents Received", "CUSTOMER_ENGAGEMENT", "count", "Docs received", "MONTHLY", ALL_SALES),
    ("CE_FU_DONE", "Follow-ups Completed", "CUSTOMER_ENGAGEMENT", "count", "Follow-ups completed", "WEEKLY", ALL_SALES),
    ("CE_FU_OVER", "Follow-ups Overdue", "CUSTOMER_ENGAGEMENT", "count", "Follow-ups past due", "WEEKLY", ALL_SALES),
    ("CE_ENG_FREQ", "Engagement Frequency", "CUSTOMER_ENGAGEMENT", "/week", "Touches per active account per week", "WEEKLY", ALL_SALES),
    ("CE_NA_COMP", "Next-Action Compliance", "CUSTOMER_ENGAGEMENT", "%", "Next actions completed on time / due × 100", "WEEKLY", ALL_SALES),

    # ── Proposal & Conversion ──
    ("PC_PROP_PREP", "Proposals Under Preparation", "PROPOSAL_CONVERSION", "count", "Proposals in draft", "WEEKLY", ALL_SALES),
    ("PC_PROP_SUB", "Proposals Submitted", "PROPOSAL_CONVERSION", "count", "Proposals submitted", "MONTHLY", ALL_SALES),
    ("PC_PROP_TAT", "Proposal Submission TAT", "PROPOSAL_CONVERSION", "days", "Avg days request → submission", "MONTHLY", ALL_SALES),
    ("PC_PROP_VAL", "Total Proposal Value", "PROPOSAL_CONVERSION", "INR", "Sum of submitted proposal values", "MONTHLY", ALL_SALES),
    ("PC_NEG_INIT", "Commercial Negotiations Initiated", "PROPOSAL_CONVERSION", "count", "Negotiations started", "MONTHLY", ALL_SALES),
    ("PC_PROP_WON", "Proposals Won", "PROPOSAL_CONVERSION", "count", "Proposals converted to Won", "MONTHLY", ALL_SALES),
    ("PC_PROP_LOST", "Proposals Lost", "PROPOSAL_CONVERSION", "count", "Proposals lost", "MONTHLY", ALL_SALES),
    ("PC_PROP_CONV", "Proposal Conversion %", "PROPOSAL_CONVERSION", "%", "Won / eligible proposals × 100", "MONTHLY", ALL_SALES),
    ("PC_NEG_DUR", "Average Negotiation Duration", "PROPOSAL_CONVERSION", "days", "Avg negotiation period", "QUARTERLY", ALL_SALES),
    ("PC_LOST_REASONS", "Lost Proposal Reasons Documented", "PROPOSAL_CONVERSION", "%", "Lost proposals with reason / lost × 100", "MONTHLY", ALL_SALES),

    # ── Revenue & Commercial ──
    ("RC_ORDER_VAL", "Confirmed Order Value", "REVENUE_COMMERCIAL", "INR", "Signed order value", "MONTHLY", ALL_SALES),
    ("RC_INVOICED", "Invoiced Revenue", "REVENUE_COMMERCIAL", "INR", "Invoices raised", "MONTHLY", ALL_SALES),
    ("RC_COLLECT", "Collections Received", "REVENUE_COMMERCIAL", "INR", "Payments received", "MONTHLY", ALL_SALES),
    ("RC_OUTSTAND", "Outstanding Payment Value", "REVENUE_COMMERCIAL", "INR", "Receivables pending", "MONTHLY", ALL_SALES),
    ("RC_PAY_FU", "Payment Follow-ups Completed", "REVENUE_COMMERCIAL", "count", "Payment reminders completed", "MONTHLY", ALL_SALES),

    # ── Functional — Kiran (Operations) ──
    ("OPS_SOP", "SOP Compliance", "FUNC_OPS", "%", "Steps followed per SOP checklist", "MONTHLY", ["OPERATIONS_COORDINATOR"]),
    ("OPS_PROP_TAT", "Proposal Coordination TAT", "FUNC_OPS", "days", "Avg days from request to coordinated submission", "MONTHLY", ["OPERATIONS_COORDINATOR"]),
    ("OPS_PROP_COMPL", "Proposal Completeness", "FUNC_OPS", "%", "Checklist-complete proposals / total × 100", "MONTHLY", ["OPERATIONS_COORDINATOR"]),
    ("OPS_HANDOVER", "Project Handover Completeness", "FUNC_OPS", "%", "Complete handovers / total × 100", "MONTHLY", ["OPERATIONS_COORDINATOR"]),
    ("OPS_REPORT_ACC", "Sales Reporting Accuracy", "FUNC_OPS", "%", "Validated / reviewed records × 100", "MONTHLY", ["OPERATIONS_COORDINATOR"]),
    ("OPS_DAILY_CLOSE", "Daily Meeting Action Closure", "FUNC_OPS", "%", "Actions closed by due date / due × 100", "WEEKLY", ["OPERATIONS_COORDINATOR"]),

    # ── Functional — Vijay (MIS) ──
    ("MIS_ACC", "MIS Report Accuracy", "FUNC_MIS", "%", "Correct records / reviewed × 100", "MONTHLY", ["MIS_BUSINESS_ANALYST"]),
    ("MIS_TIME", "MIS Report Submission Timeliness", "FUNC_MIS", "%", "On-time submissions / due × 100", "MONTHLY", ["MIS_BUSINESS_ANALYST"]),
    ("MIS_DATA_COMP", "Data Completeness", "FUNC_MIS", "%", "Records with all mandatory fields / total × 100", "MONTHLY", ["MIS_BUSINESS_ANALYST"]),
    ("MIS_PIPE_ACC", "Pipeline Reporting Accuracy", "FUNC_MIS", "%", "Correct pipeline rows / audited × 100", "MONTHLY", ["MIS_BUSINESS_ANALYST"]),
    ("MIS_FORECAST", "Sales Forecast Accuracy", "FUNC_MIS", "%", "100 − |forecast − actual|/actual × 100", "MONTHLY", ["MIS_BUSINESS_ANALYST"]),
    ("MIS_INSIGHTS", "Actionable Insights Submitted", "FUNC_MIS", "count", "Insight notes submitted", "MONTHLY", ["MIS_BUSINESS_ANALYST"]),

    # ── Functional — Satvinder (Marketing) ──
    ("MKT_CAL_EXEC", "Marketing Calendar Execution", "FUNC_MARKETING", "%", "Calendar items delivered on date / planned × 100", "MONTHLY", ["MARKETING_MANAGER"]),
    ("MKT_CAMP_PLAN", "Campaigns Planned", "FUNC_MARKETING", "count", "Campaigns in planned status", "MONTHLY", ["MARKETING_MANAGER"]),
    ("MKT_CAMP_LAUNCH", "Campaigns Launched", "FUNC_MARKETING", "count", "Campaigns moved to running", "MONTHLY", ["MARKETING_MANAGER"]),
    ("MKT_CONTENT", "Content Pieces Created", "FUNC_MARKETING", "count", "Content assets delivered", "MONTHLY", ["MARKETING_MANAGER"]),
    ("MKT_LEADS", "Campaign Leads Generated", "FUNC_MARKETING", "count", "Leads attributed to campaigns", "MONTHLY", ["MARKETING_MANAGER"]),
    ("MKT_QLEADS", "Qualified Leads from Campaigns", "FUNC_MARKETING", "count", "Qualified campaign leads", "MONTHLY", ["MARKETING_MANAGER"]),
    ("MKT_ATTR_VAL", "Campaign-Attributed Business Value", "FUNC_MARKETING", "INR", "Won revenue attributed to campaigns", "QUARTERLY", ["MARKETING_MANAGER"]),

    # ── Functional — BD (Kabir / Kriti / Mounika) ──
    ("BD_NEW_ACC", "New Account Development", "FUNC_BD", "count", "New accounts won in period", "QUARTERLY", ["SALES_MARKETING_CONTRIBUTOR"]),
    ("BD_DORMANT", "Dormant Account Reactivation", "FUNC_BD", "count", "Dormant accounts reactivated", "QUARTERLY", ["SALES_MARKETING_CONTRIBUTOR"]),
    ("BD_PIPE_GROWTH", "Pipeline Growth", "FUNC_BD", "INR", "Net new pipeline added in period", "MONTHLY", ["SALES_MARKETING_CONTRIBUTOR"]),

    # ── Functional — Manoj (HOD) ──
    ("HOD_DEPT_ACH", "Department Target Achievement", "FUNC_HOD", "%", "Dept confirmed sales / dept target × 100", "MONTHLY", ["HEAD_OF_DEPARTMENT"]),
    ("HOD_DEPT_PIPE", "Department Pipeline Value", "FUNC_HOD", "INR", "Open pipeline across team", "MONTHLY", ["HEAD_OF_DEPARTMENT"]),
    ("HOD_TEAM_ACH", "Team Individual Target Achievement", "FUNC_HOD", "%", "Avg of individual achievement %", "MONTHLY", ["HEAD_OF_DEPARTMENT"]),
    ("HOD_FORECAST", "Sales Forecast Accuracy (Dept)", "FUNC_HOD", "%", "100 − |forecast − actual|/actual × 100", "QUARTERLY", ["HEAD_OF_DEPARTMENT"]),
    ("HOD_REVIEW_CLOSE", "Review Action Closure", "FUNC_HOD", "%", "Closed actions / open × 100", "MONTHLY", ["HEAD_OF_DEPARTMENT"]),
    ("HOD_LOST_REVIEW", "Lost Opportunity Review", "FUNC_HOD", "%", "Lost opps reviewed / lost × 100", "MONTHLY", ["HEAD_OF_DEPARTMENT"]),
]

FREQUENCIES = ["DAILY", "WEEKLY", "FORTNIGHTLY", "MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUAL"]

LOWER_IS_BETTER = {"SP_CYCLE_DAYS", "LP_RESPONSE_T", "CE_FU_OVER", "PC_PROP_TAT", "PC_NEG_DUR",
                   "RC_OUTSTAND", "OPS_PROP_TAT"}

# KPI code -> metrics key computed from live records (others are MANUAL entry)
SYSTEM_KPI_MAP = {
    "SP_INDIV_TARGET": "confirmed_won_inr", "SP_CONF_SALES": "confirmed_won_inr",
    "SP_WON_VAL": "confirmed_won_inr", "RC_ORDER_VAL": "confirmed_won_inr",
    "SP_TARGET_ACH_PCT": "achievement_pct", "SP_NEW_LEADS": "leads_total", "LP_NEW_REG": "leads_total",
    "SP_QUAL_LEADS": "leads_qualified", "LP_QUAL_GEN": "leads_qualified",
    "SP_MEETINGS": "meetings_completed", "CE_MTG_DONE": "meetings_completed",
    "SP_CALLS": "calls_completed", "CE_CALLS": "calls_completed",
    "SP_PROP_SUB": "proposals_submitted", "PC_PROP_SUB": "proposals_submitted",
    "SP_PROP_VAL": "proposal_value_inr", "PC_PROP_VAL": "proposal_value_inr",
    "SP_OPP_CREATED": "opp_created", "SP_PIPE_VAL": "pipeline_inr",
    "SP_OPP_WON": "won_count", "SP_OPP_LOST": "lost_count",
    "SP_PROP_CONV": "win_rate_pct", "SP_FU_COMP": "followup_compliance_pct",
    "CE_FU_DONE": "followups_completed", "CE_FU_OVER": "followups_pending",
    "SP_AVG_DEAL": "avg_deal_inr", "LP_QUAL_PCT": "lead_qualification_pct",
    "SP_LOST_DOC": "lost_doc_pct", "SP_L2O_CONV": "l2o_pct",
    "LP_REFERRAL": "src:Referral", "LP_LINKEDIN": "src:LinkedIn", "LP_EMAIL": "src:Email",
    "LP_CAMPAIGN": "src:Marketing Campaign", "LP_INBOUND": "src:Website",
    "HOD_DEPT_ACH": "dept:achievement_pct", "HOD_DEPT_PIPE": "dept:pipeline_inr",
    "HOD_TEAM_ACH": "dept:team_avg_achievement_pct",
}

# Default 7 core KPIs per responsibility (first matching profile wins)
_SHARED = ["SP_CONF_SALES", "SP_QUAL_LEADS"]
CORE_KPI_PROFILES = [
    ("HEAD_OF_DEPARTMENT", ["SP_CONF_SALES", "HOD_DEPT_ACH", "HOD_DEPT_PIPE", "HOD_TEAM_ACH", "HOD_FORECAST", "HOD_REVIEW_CLOSE", "HOD_LOST_REVIEW"]),
    ("OPERATIONS_COORDINATOR", _SHARED + ["OPS_SOP", "OPS_PROP_TAT", "OPS_PROP_COMPL", "OPS_HANDOVER", "OPS_REPORT_ACC"]),
    ("MIS_BUSINESS_ANALYST", _SHARED + ["MIS_ACC", "MIS_TIME", "MIS_DATA_COMP", "MIS_PIPE_ACC", "MIS_FORECAST"]),
    ("MARKETING_MANAGER", _SHARED + ["MKT_CAL_EXEC", "MKT_CAMP_LAUNCH", "MKT_CONTENT", "MKT_LEADS", "MKT_ATTR_VAL"]),
    ("SALES_MARKETING_CONTRIBUTOR", _SHARED + ["SP_MEETINGS", "SP_PROP_SUB", "SP_PIPE_VAL", "BD_NEW_ACC", "BD_PIPE_GROWTH"]),
]
