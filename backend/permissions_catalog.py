"""Catalog of permissions and seeded roles for Focus PMS."""

PERMISSIONS: dict[str, str] = {
    # User & Access Management
    "USER_ONBOARDING_ADMIN": "Create and invite employees, assign roles & permissions, manage reporting hierarchy, activate/deactivate accounts.",
    "USER_VIEW": "View employee directory and basic access information.",
    # System administration
    "SYSTEM_ADMIN": "Unrestricted technical administrator (settings, security policies).",
    # Executive / HOD visibility
    "MANAGEMENT_BOARD_VIEW": "Executive dashboard access — department performance, revenue, pipeline, collections.",
    "HOD_VIEW": "Head of Department view — department performance and approvals.",
    # Sales
    "SALES_LEAD_MANAGE": "Create and manage leads.",
    "SALES_ACCOUNT_MANAGE": "Create and manage customer accounts.",
    "SALES_OPPORTUNITY_MANAGE": "Create and manage sales opportunities (own and shared).",
    "SALES_OPPORTUNITY_APPROVE": "Approve opportunity decisions, credit splits, closures.",
    "SALES_REPORT_VIEW": "View department sales performance reports.",
    # Marketing
    "MARKETING_CAMPAIGN_MANAGE": "Plan, run and track marketing campaigns and the content calendar.",
    "MARKETING_REPORT_VIEW": "View marketing performance & lead attribution reports.",
    # Targets & KPIs
    "TARGETS_VIEW": "View assigned sales/activity targets and KPIs.",
    "TARGETS_CONFIGURE": "Create/modify sales targets, activity targets, KPI library and KPI assignments.",
    "TARGETS_APPROVE": "Approve or reject target revisions.",
    "KPI_ACTUAL_SELF_UPDATE": "Enter own actuals for manually-measured KPIs.",
    "KPI_ACTUAL_VALIDATE": "Validate KPI actuals submitted by employees.",
    "TEAM_PERFORMANCE_VIEW": "Read-only view of other employees' individual performance and targets.",
    # Reports / MIS
    "MIS_REPORT_VIEW": "Access MIS, pipeline analytics and management reports.",
    "MIS_REPORT_EXPORT": "Export reports to Excel/CSV.",
    # Audit
    "AUDIT_VIEW": "View audit log of important user actions.",
}

# Shared sales accountability — EVERY contributor gets these:
SHARED_SALES_PERMS = [
    "SALES_LEAD_MANAGE",
    "SALES_ACCOUNT_MANAGE",
    "SALES_OPPORTUNITY_MANAGE",
    "SALES_REPORT_VIEW",
    "MARKETING_REPORT_VIEW",
    "TARGETS_VIEW",
    "KPI_ACTUAL_SELF_UPDATE",
]

SEED_ROLES: list[dict] = [
    {
        "code": "SYSTEM_ADMINISTRATOR",
        "name": "System Administrator",
        "description": "Full technical and business administration.",
        "permissions": list(PERMISSIONS.keys()),
        "is_system": True,
    },
    {
        "code": "MANAGEMENT_BOARD",
        "name": "Management Board",
        "description": "Executive visibility and authorised management decisions.",
        "permissions": [
            "MANAGEMENT_BOARD_VIEW",
            "SALES_REPORT_VIEW",
            "MARKETING_REPORT_VIEW",
            "MIS_REPORT_VIEW",
            "MIS_REPORT_EXPORT",
            "TARGETS_VIEW",
            "TARGETS_APPROVE",
            "TEAM_PERFORMANCE_VIEW",
            "AUDIT_VIEW",
        ],
        "is_system": True,
    },
    {
        "code": "HEAD_OF_DEPARTMENT",
        "name": "Head of Department",
        "description": "Department leadership — targets, performance, approvals.",
        "permissions": [
            "HOD_VIEW",
            "USER_VIEW",
            *SHARED_SALES_PERMS,
            "SALES_OPPORTUNITY_APPROVE",
            "MARKETING_CAMPAIGN_MANAGE",
            "TARGETS_CONFIGURE",
            "TARGETS_APPROVE",
            "KPI_ACTUAL_VALIDATE",
            "TEAM_PERFORMANCE_VIEW",
            "MIS_REPORT_VIEW",
            "MIS_REPORT_EXPORT",
            "AUDIT_VIEW",
        ],
        "is_system": True,
    },
    {
        "code": "USER_ONBOARDING_ADMIN",
        "name": "User Onboarding Administrator",
        "description": "Onboard employees and manage access (no technical admin).",
        "permissions": [
            "USER_ONBOARDING_ADMIN",
            "USER_VIEW",
            "AUDIT_VIEW",
        ],
        "is_system": True,
    },
    {
        "code": "SALES_MARKETING_CONTRIBUTOR",
        "name": "Sales & Marketing Contributor",
        "description": "Integrated sales + marketing team member.",
        "permissions": SHARED_SALES_PERMS,
        "is_system": True,
    },
    {
        "code": "MARKETING_MANAGER",
        "name": "Marketing Manager",
        "description": "Campaigns, creative, lead generation + shared sales accountability.",
        "permissions": [*SHARED_SALES_PERMS, "MARKETING_CAMPAIGN_MANAGE"],
        "is_system": True,
    },
    {
        "code": "MIS_BUSINESS_ANALYST",
        "name": "MIS & Business Analyst",
        "description": "MIS, pipeline analytics + shared sales accountability.",
        "permissions": [*SHARED_SALES_PERMS, "MIS_REPORT_VIEW", "MIS_REPORT_EXPORT"],
        "is_system": True,
    },
    {
        "code": "OPERATIONS_COORDINATOR",
        "name": "Operations Coordinator",
        "description": "Operations, proposal coordination + shared sales accountability.",
        "permissions": SHARED_SALES_PERMS,
        "is_system": True,
    },
]
