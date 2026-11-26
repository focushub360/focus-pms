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
    ("PROJECT_DELIVERY", "Optional Project-Based KPIs"),
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

    # ── Additional Role & Optional Project-Based KPIs ──
    ("EA_EXEC_PACK", "Executive Review Pack Readiness", "FUNC_MIS", "%", "Executive packs ready ahead of review / total × 100", "MONTHLY", ["MIS_BUSINESS_ANALYST"]),
    ("MKT_SLA", "Brand & Collateral Turnaround SLA", "FUNC_MARKETING", "%", "Creatives delivered within SLA / requested × 100", "MONTHLY", ["MARKETING_MANAGER"]),
    ("PRJ_HANDOVER", "Project Handover & Kickoff Quality", "PROJECT_DELIVERY", "%", "Complete project handovers / projects × 100", "MONTHLY", ALL_SALES),
    ("PRJ_EXPANSION", "Key Account Project Expansion", "PROJECT_DELIVERY", "INR", "Follow-on orders from active projects", "MONTHLY", ALL_SALES),
    ("PRJ_MILESTONE", "Project Milestone Adherence", "PROJECT_DELIVERY", "%", "On-time engineering milestones / total × 100", "MONTHLY", ALL_SALES),
    ("PRJ_COMMISSIONING", "Commissioning Readiness & Sign-off", "PROJECT_DELIVERY", "%", "Projects commissioned on schedule / total × 100", "MONTHLY", ALL_SALES),
    ("PRJ_COST_TRACK", "Project Costing & Margin Tracking", "PROJECT_DELIVERY", "%", "Projects with monthly margin reports / total × 100", "MONTHLY", ALL_SALES),
    ("PRJ_RISK_LOG", "Project Governance & Risk Logs", "PROJECT_DELIVERY", "%", "Active projects with updated risk logs / total × 100", "MONTHLY", ALL_SALES),
    ("PRJ_CASE_STUDY", "Project Case Study & Showcase Delivery", "PROJECT_DELIVERY", "count", "Published engineering case studies", "MONTHLY", ALL_SALES),
    ("PRJ_EVENT_EXEC", "Trade Event / Showcase Execution", "PROJECT_DELIVERY", "%", "Planned event milestones completed / total × 100", "MONTHLY", ALL_SALES),
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


def _tpl_item(
    code: str,
    name: str,
    measurement: str,
    unit: str,
    weight: float,
    default_target: float,
    frequency: str = "Monthly",
    source: str = "Manual",
    direction: str = "higher",
    kpi_group: str = "Functional",
    is_optional: bool = False,
    is_active: bool = True,
    data_source: str = "MANUAL",
) -> dict:
    return {
        "kpi_code": code,
        "kpi_name": name,
        "measurement": measurement,
        "unit": unit,
        "weight": weight,
        "default_target": default_target,
        "frequency": frequency,
        "source": source,
        "direction": direction,
        "kpi_group": kpi_group,
        "is_optional": is_optional,
        "is_project_kpi": is_optional,
        "is_active": is_active,
        "data_source": data_source,
    }


_SALES_REGULAR_ITEMS = [
    _tpl_item("SP_NEW_LEADS", "Leads Generated", "Number of new leads generated", "count", 10, 20, "Weekly", "CRM Leads", "higher", "Sales & BD", False, True, "SYSTEM"),
    _tpl_item("SP_QUAL_LEADS", "Qualified Leads", "Number of leads meeting qualification criteria", "count", 15, 12, "Weekly", "CRM Leads", "higher", "Sales & BD", False, True, "SYSTEM"),
    _tpl_item("SP_MEETINGS", "Customer Meetings", "Customer meetings completed", "count", 15, 16, "Weekly", "Calendar & Activities", "higher", "Sales & BD", False, True, "SYSTEM"),
    _tpl_item("SP_PROP_SUB", "Proposals Submitted", "Number of proposals submitted", "count", 15, 6, "Weekly", "CRM Opportunities", "higher", "Sales & BD", False, True, "SYSTEM"),
    _tpl_item("SP_FU_COMP", "Follow-up Compliance", "Follow-ups completed against planned follow-ups", "%", 10, 95, "Weekly", "Calendar & Activities", "higher", "Sales & BD", False, True, "SYSTEM"),
    _tpl_item("SP_PROP_CONV", "Conversion to Sales", "Percentage of qualified opportunities converted", "%", 15, 30, "Monthly", "CRM Opportunities", "higher", "Sales & BD", False, True, "SYSTEM"),
    _tpl_item("SP_CONF_SALES", "Revenue Achievement", "Revenue achieved against assigned monthly target", "INR", 20, 1000000, "Monthly", "CRM Opportunities", "higher", "Sales & BD", False, True, "SYSTEM"),
]

_SALES_SHARED_FOR_FUNCTIONAL = [
    _tpl_item("SP_NEW_LEADS", "Leads Generated", "Number of new leads generated", "count", 5, 10, "Weekly", "CRM Leads", "higher", "Sales & BD", False, True, "SYSTEM"),
    _tpl_item("SP_QUAL_LEADS", "Qualified Leads", "Number of leads meeting qualification criteria", "count", 5, 6, "Weekly", "CRM Leads", "higher", "Sales & BD", False, True, "SYSTEM"),
    _tpl_item("SP_MEETINGS", "Customer Meetings", "Customer meetings completed", "count", 5, 8, "Weekly", "Calendar & Activities", "higher", "Sales & BD", False, True, "SYSTEM"),
    _tpl_item("SP_PROP_SUB", "Proposals Submitted", "Number of proposals submitted", "count", 5, 3, "Weekly", "CRM Opportunities", "higher", "Sales & BD", False, True, "SYSTEM"),
    _tpl_item("SP_FU_COMP", "Follow-up Compliance", "Follow-ups completed against planned follow-ups", "%", 5, 95, "Weekly", "Calendar & Activities", "higher", "Sales & BD", False, True, "SYSTEM"),
    _tpl_item("SP_PROP_CONV", "Conversion to Sales", "Percentage of qualified opportunities converted", "%", 5, 25, "Monthly", "CRM Opportunities", "higher", "Sales & BD", False, True, "SYSTEM"),
    _tpl_item("SP_CONF_SALES", "Revenue Achievement", "Revenue achieved against assigned monthly target", "INR", 10, 500000, "Monthly", "CRM Opportunities", "higher", "Sales & BD", False, True, "SYSTEM"),
]


MONTHLY_ROLE_TEMPLATES = {
    "SALES": {
        "code": "SALES",
        "label": "Sales & Business Development",
        "description": "Sales & Business Development KPIs (Manoj, Kriti, Mounika, Kabir) + optional project KPIs.",
        "items": [
            *_SALES_REGULAR_ITEMS,
            _tpl_item("PRJ_HANDOVER", "Project Handover & Kickoff", "Complete project handovers / total", "%", 0, 95, "Project-based", "Project Tracker", "higher", "Optional", True, False, "MANUAL"),
            _tpl_item("PRJ_EXPANSION", "Key Account Project Expansion", "Follow-on orders from active projects", "INR", 0, 300000, "Project-based", "CRM Opportunities", "higher", "Optional", True, False, "MANUAL"),
        ],
    },
    "OPERATIONS": {
        "code": "OPERATIONS",
        "label": "Operations",
        "description": "Operations coordination, issue resolution, client management & optional project-based KPIs.",
        "items": [
            _tpl_item("OPS_PROJ_COORD", "Project Coordination", "Projects / activities coordinated and milestone follow-ups", "count", 25, 12, "Weekly", "Project tracker / meeting minutes", "higher", "Functional", False, True, "MANUAL"),
            _tpl_item("OPS_ISSUE_RES", "Issue Resolution", "Issues resolved within agreed timelines", "%", 20, 95, "Weekly", "Issue / risk register", "higher", "Functional", False, True, "MANUAL"),
            _tpl_item("OPS_CLIENT_MGMT", "Client & Stakeholder Management", "Client meetings, follow-ups and action closure", "count", 20, 15, "Weekly", "Client action tracker", "higher", "Functional", False, True, "MANUAL"),
            _tpl_item("OPS_REPORT_ACC", "Reporting & Data Accuracy", "Accuracy and timely submission of operational reports", "%", 20, 98, "Monthly", "MIS / report review", "higher", "Functional", False, True, "MANUAL"),
            _tpl_item("OPS_FOLLOWUP", "Operational Follow-up", "Pending actions followed up and closed", "%", 15, 95, "Weekly", "Action tracker", "higher", "Functional", False, True, "MANUAL"),
            _tpl_item("OPS_OPT_PROJ_DELIVERY", "Project Delivery", "Assigned project delivery milestones completed on schedule", "%", 0, 95, "Project-based", "Project tracker", "higher", "Optional", True, False, "MANUAL"),
            _tpl_item("OPS_OPT_SOP", "SOP Development & Restructuring", "SOP modules authored or restructured", "count", 0, 2, "Project-based", "SOP register", "higher", "Optional", True, False, "MANUAL"),
            _tpl_item("OPS_OPT_PROC_IMP", "Process Improvement / Implementation", "Operational process improvements rolled out", "count", 0, 2, "Project-based", "Improvement tracker", "higher", "Optional", True, False, "MANUAL"),
            _tpl_item("OPS_OPT_NEW_PROJ", "New Project Implementation", "New project rollouts completed per plan", "count", 0, 1, "Project-based", "Project plan / milestone tracker", "higher", "Optional", True, False, "MANUAL"),
        ],
    },
    "EA_BA": {
        "code": "EA_BA",
        "label": "EA & Business Analyst + Sales (Vijay Devadas)",
        "description": "Primary EA/BA functional KPIs retained alongside Sales & Business Development KPIs + optional KPIs.",
        "items": [
            _tpl_item("EA_MGMT_COORD", "Management Coordination", "Management requests, meetings and activities coordinated", "%", 10, 95, "Weekly", "Calendar & EA Log", "higher", "Functional", False, True, "MANUAL"),
            _tpl_item("MIS_ACC", "MIS & Reporting Accuracy", "Accuracy and timely submission of MIS reports", "%", 10, 98, "Monthly", "MIS Reports", "higher", "Functional", False, True, "MANUAL"),
            _tpl_item("EA_BA_ANALYSIS", "Business Analysis", "Analysis assignments completed and accepted", "count", 10, 4, "Monthly", "MIS & Analytics", "higher", "Functional", False, True, "MANUAL"),
            _tpl_item("EA_DATA_MGMT", "Data Management", "Data updated, validated and maintained accurately", "%", 10, 98, "Weekly", "CRM & Master Data", "higher", "Functional", False, True, "MANUAL"),
            _tpl_item("EA_MKT_RESEARCH", "Market Research", "Research assignments completed and submitted", "count", 5, 2, "Monthly", "Research Briefs", "higher", "Functional", False, True, "MANUAL"),
            _tpl_item("EA_DOC_MGMT", "Documentation Management", "Documents prepared, updated and delivered", "count", 5, 6, "Monthly", "Document Repository", "higher", "Functional", False, True, "MANUAL"),
            _tpl_item("EA_ACTION_TRACK", "Action Item Tracking", "Management / project action items followed up and closed", "%", 10, 95, "Weekly", "Daily & Review Logs", "higher", "Functional", False, True, "MANUAL"),
            *_SALES_SHARED_FOR_FUNCTIONAL,
            _tpl_item("EA_OPT_PROJ_COORD", "Project Coordination Support", "Assigned project coordination deliverables completed", "%", 0, 95, "Project-based", "Project Tracker", "higher", "Optional", True, False, "MANUAL"),
            _tpl_item("EA_OPT_SOP_DOC", "SOP & Process Documentation", "SOP and process documents completed", "count", 0, 2, "Project-based", "Process Docs", "higher", "Optional", True, False, "MANUAL"),
            _tpl_item("EA_OPT_PROC_MAP", "Process Mapping", "End-to-end process maps delivered", "count", 0, 2, "Project-based", "Process Docs", "higher", "Optional", True, False, "MANUAL"),
            _tpl_item("EA_OPT_DATA_CLEAN", "Data Cleansing & Validation", "Records audited and cleansed against quality rules", "%", 0, 98, "Project-based", "CRM Audit", "higher", "Optional", True, False, "MANUAL"),
            _tpl_item("EA_OPT_AUTOMATION", "Automation / Reporting Improvement", "Reporting automation or workflow improvements shipped", "count", 0, 1, "Project-based", "MIS Automation", "higher", "Optional", True, False, "MANUAL"),
        ],
    },
    "CREATIVE": {
        "code": "CREATIVE",
        "label": "Creative Head + Sales (Satvinder Kaur)",
        "description": "Primary Creative Design KPIs retained alongside Sales & Business Development KPIs + optional KPIs.",
        "items": [
            _tpl_item("CR_TASK_DELIVERY", "Design Task Delivery", "Assigned design work delivered within agreed deadlines", "%", 10, 95, "Weekly", "Creative Tracker", "higher", "Functional", False, True, "MANUAL"),
            _tpl_item("CR_QUALITY_APP", "Design Quality & First-round Approval", "Designs accepted during initial review", "%", 10, 90, "Monthly", "Design Reviews", "higher", "Functional", False, True, "MANUAL"),
            _tpl_item("CR_BRAND_COMP", "Brand Guideline Compliance", "Designs following approved brand guidelines", "%", 10, 100, "Monthly", "Brand Audit", "higher", "Functional", False, True, "MANUAL"),
            _tpl_item("CR_BRIEF_UNDER", "Creative Brief Understanding", "Designs aligned with approved creative briefs", "%", 5, 95, "Monthly", "Creative Briefs", "higher", "Functional", False, True, "MANUAL"),
            _tpl_item("CR_TAT", "Design Turnaround Time", "Design requests completed within agreed timelines", "%", 10, 95, "Weekly", "Creative Tracker", "higher", "Functional", False, True, "MANUAL"),
            _tpl_item("CR_REVISION", "Revision Management", "Revisions completed within agreed timelines", "%", 5, 95, "Weekly", "Creative Tracker", "higher", "Functional", False, True, "MANUAL"),
            _tpl_item("CR_ASSET_MGMT", "Creative Asset Management", "Creative files and assets organised and maintained", "%", 10, 98, "Monthly", "Asset Library", "higher", "Functional", False, True, "MANUAL"),
            *_SALES_SHARED_FOR_FUNCTIONAL,
            _tpl_item("CR_OPT_SOCIAL", "Social Media & Digital Creatives", "Social/digital creative deliverables shipped", "count", 0, 12, "Project-based", "Marketing Calendar", "higher", "Optional", True, False, "MANUAL"),
            _tpl_item("CR_OPT_PITCH", "Presentation & Pitch Deck Design", "Client pitch decks & presentations designed", "count", 0, 3, "Project-based", "Sales Enablement", "higher", "Optional", True, False, "MANUAL"),
            _tpl_item("CR_OPT_VIDEO", "Video / Motion Graphics", "Video or motion graphic assets produced", "count", 0, 2, "Project-based", "Media Library", "higher", "Optional", True, False, "MANUAL"),
            _tpl_item("CR_OPT_EVENT", "Event & Exhibition Branding", "Event/exhibition branding collateral delivered", "count", 0, 1, "Project-based", "Marketing Events", "higher", "Optional", True, False, "MANUAL"),
            _tpl_item("CR_OPT_PRINT", "Print & Production Artwork", "Print-ready artwork delivered error-free", "count", 0, 4, "Project-based", "Print Production", "higher", "Optional", True, False, "MANUAL"),
            _tpl_item("CR_OPT_WEB", "Website / Landing Page Visuals", "Web/landing page visual assets delivered", "count", 0, 2, "Project-based", "Web Assets", "higher", "Optional", True, False, "MANUAL"),
            _tpl_item("CR_OPT_CAMPAIGN", "Campaign Creative Concept Development", "Campaign creative concepts developed & approved", "count", 0, 2, "Project-based", "Marketing Campaigns", "higher", "Optional", True, False, "MANUAL"),
        ],
    },
}


import re


def template_code_for_user(user: dict) -> str:
    email = (user.get("email") or "").lower()
    name = (user.get("name") or "").lower()
    if "kiran" in email or "kiran" in name:
        return "OPERATIONS"
    if "vijay" in email or "vijay" in name:
        return "EA_BA"
    if "satvinder" in email or "satvinder" in name:
        return "CREATIVE"

    roles = set(user.get("role_codes") or [])
    if "OPERATIONS_COORDINATOR" in roles:
        return "OPERATIONS"
    if "MIS_BUSINESS_ANALYST" in roles:
        return "EA_BA"
    if "MARKETING_MANAGER" in roles:
        return "CREATIVE"
    fr = (user.get("functional_responsibility") or "").lower()
    if "operation" in fr:
        return "OPERATIONS"
    if "mis" in fr or "analysis" in fr or "executive assistant" in fr or re.search(r"\bea\b", fr):
        return "EA_BA"
    if "creative" in fr or "marketing" in fr:
        return "CREATIVE"
    return "SALES"
