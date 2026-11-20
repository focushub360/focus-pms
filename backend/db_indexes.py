"""Production MongoDB index management for Focus PMS.
Ensures query efficiency, uniqueness constraints, and data integrity.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("focus-pms.db")

# Collection indexes specification: (collection_name, index_spec, options)
INDEX_SPECIFICATIONS = [
    # Users
    ("users", [("email", 1)], {"unique": True, "name": "idx_users_email_unique"}),
    ("users", [("employee_id", 1)], {"unique": True, "sparse": True, "name": "idx_users_employee_id_unique"}),
    ("users", [("role_codes", 1)], {"name": "idx_users_role_codes"}),
    ("users", [("is_active", 1)], {"name": "idx_users_is_active"}),
    ("users", [("department", 1)], {"name": "idx_users_department"}),

    # Roles & Permissions
    ("roles", [("code", 1)], {"unique": True, "name": "idx_roles_code_unique"}),
    ("permissions", [("code", 1)], {"unique": True, "name": "idx_permissions_code_unique"}),

    # Authentication & Security
    ("invitations", [("token", 1)], {"unique": True, "name": "idx_invitations_token_unique"}),
    ("invitations", [("email", 1)], {"name": "idx_invitations_email"}),
    ("password_resets", [("token", 1)], {"unique": True, "name": "idx_password_resets_token_unique"}),
    ("password_resets", [("email", 1)], {"name": "idx_password_resets_email"}),

    # Audit Logs (high volume query/sort)
    ("audit_logs", [("at", -1)], {"name": "idx_audit_logs_at_desc"}),
    ("audit_logs", [("entity", 1), ("entity_id", 1)], {"name": "idx_audit_logs_entity"}),
    ("audit_logs", [("user_id", 1), ("at", -1)], {"name": "idx_audit_logs_user_at"}),
    ("audit_logs", [("module", 1)], {"name": "idx_audit_logs_module"}),

    # Daily Reports & Corrections
    ("daily_reports", [("user_id", 1), ("date", 1)], {"unique": True, "name": "idx_daily_reports_user_date_unique"}),
    ("daily_reports", [("date", 1)], {"name": "idx_daily_reports_date"}),
    ("daily_reports", [("status", 1)], {"name": "idx_daily_reports_status"}),
    ("daily_corrections", [("user_id", 1), ("date", 1)], {"name": "idx_daily_corrections_user_date"}),
    ("daily_corrections", [("status", 1)], {"name": "idx_daily_corrections_status"}),

    # Calendar & Activities
    ("activities", [("start_at", 1)], {"name": "idx_activities_start_at"}),
    ("activities", [("user_id", 1), ("start_at", 1)], {"name": "idx_activities_user_start"}),
    ("activities", [("activity_type", 1)], {"name": "idx_activities_type"}),
    ("activities", [("is_deleted", 1)], {"name": "idx_activities_is_deleted"}),

    # Sales CRM: Opportunities
    ("opportunities", [("primary_owner_id", 1)], {"name": "idx_opps_owner"}),
    ("opportunities", [("stage", 1)], {"name": "idx_opps_stage"}),
    ("opportunities", [("status", 1)], {"name": "idx_opps_status"}),
    ("opportunities", [("account_id", 1)], {"name": "idx_opps_account"}),
    ("opportunities", [("created_at", -1)], {"name": "idx_opps_created_at_desc"}),

    # Leads & Accounts
    ("leads", [("status", 1)], {"name": "idx_leads_status"}),
    ("leads", [("assigned_to", 1)], {"name": "idx_leads_assigned_to"}),
    ("leads", [("created_at", -1)], {"name": "idx_leads_created_at_desc"}),
    ("accounts", [("name", 1)], {"name": "idx_accounts_name"}),
    ("accounts", [("created_at", -1)], {"name": "idx_accounts_created_at_desc"}),
    ("campaigns", [("created_at", -1)], {"name": "idx_campaigns_created_at_desc"}),

    # KPIs & Scorecards
    ("kpis", [("category", 1)], {"name": "idx_kpis_category"}),
    ("kpi_assignments", [("user_id", 1), ("fy", 1)], {"name": "idx_kpi_assignments_user_fy"}),
    ("kpi_assignments", [("fy", 1)], {"name": "idx_kpi_assignments_fy"}),
    ("kpi_actuals", [("assignment_id", 1), ("month", 1)], {"name": "idx_kpi_actuals_assign_month"}),
    ("kpi_actuals", [("user_id", 1), ("fy", 1), ("month", 1)], {"name": "idx_kpi_actuals_user_fy_month"}),
    ("monthly_scorecards", [("user_id", 1), ("fy", 1), ("month", 1)], {"unique": True, "name": "idx_monthly_scorecards_unique"}),
    ("monthly_scorecards", [("status", 1)], {"name": "idx_monthly_scorecards_status"}),

    # Cron Runs
    ("cron_runs", [("run_id", 1)], {"unique": True, "name": "idx_cron_runs_run_id_unique"}),
    ("cron_runs", [("at", -1)], {"name": "idx_cron_runs_at_desc"}),
]


async def ensure_indexes(db: Any) -> dict[str, int]:
    """Build all production indexes idempotently, logging results."""
    created = 0
    skipped = 0
    errors = 0

    for coll_name, keys, opts in INDEX_SPECIFICATIONS:
        try:
            coll = getattr(db, coll_name)
            await coll.create_index(keys, **opts)
            created += 1
        except Exception as e:
            # If index already exists with different options or duplicate values present
            err_str = str(e).lower()
            if "already exists" in err_str or "an equivalent index already exists" in err_str:
                skipped += 1
            else:
                logger.warning("Index warning on collection '%s' for %s: %s", coll_name, keys, e)
                errors += 1

    logger.info("Database index check finished: %d ensured, %d skipped, %d warnings", created, skipped, errors)
    return {"ensured": created, "skipped": skipped, "errors": errors}

