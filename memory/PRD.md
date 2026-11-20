# Focus PMS — PRD

## Problem Statement (as given)
Focus PMS is the Sales & Marketing Performance Management System for Focus Engineering. Correct the org structure (DJ Sir on Management Board; Manoj as Head of Sales & Marketing; six integrated contributors — Kiran, Vijay, Satvinder, Kabir, Kriti, Mounika — all with equal sales accountability but separate functional KPIs). Add User & Access Management with Kiran as initial Super Administrator. Implement onboarding, roles, permissions, opportunities with credit split, targets, dashboards for 4 personas, audit log, Resend-powered email, INR formatting.

## Architecture (Feb 2026)
- **Backend:** FastAPI + MongoDB (Motor). JWT auth with bcrypt-hashed passwords. All routes under `/api`.
- **Frontend:** React 19 + React Router 7 + Tailwind + shadcn + recharts. Role-aware sidebar.
- **Email:** Emergent-managed Resend proxy with guardrails `_assert_safe_email`.
- **Permissions:** server-side `require_permission` / `require_any_permission` guards; per-record visibility filter for OWN/TEAM/DEPARTMENT/ALL.

## Personas
- **Super Admin (Kiran)** — all permissions; initial bootstrap via `BOOTSTRAP_ADMIN_PASSWORD` env, `must_change_password=true`.
- **Management Board (DJ Sir)** — executive dashboard, no employee admin.
- **HOD (Manoj)** — department-wide view + target config + approvals.
- **User Onboarding Admin (Kiran can grant to others)** — invite/manage users only, no technical admin.
- **Sales & Marketing Contributor** — shared sales accountability (6 users).
- **Marketing Manager / MIS Analyst / Ops Coordinator** — functional KPIs + shared sales accountability.

## Delivered (2026-02)
- Bootstrap super admin seed (idempotent), 8 seed roles, 15+ permissions catalog.
- Auth: login, change password, forgot/reset, accept invite, me endpoint.
- Users CRUD with full onboarding form (name/employee_id/email/mobile/designation/dept/func-resp/mgr/team/joining/status/roles/extra-perms/visibility/sales-contributor/target/KPI eligibility). Edit email supported. Resend invite + access history.
- Opportunities with primary owner + supporting contributors + credit split (server-side 100% check) + visibility filter.
- Leads / Accounts / Campaigns CRUD.
- Targets & KPIs per user per FY (upsert).
- Role-aware Dashboards — Management (KPIs, leaderboard, stage funnel, campaigns, 6-contributor scorecard) + Personal Contributor (my target, won, pipeline, opps).
- Audit Log viewer (searchable).
- INR formatting (Lakhs/Crores).
- Testing: iteration_1 passed 22/22, 0 failed.

## Phase 1 Enhancement — Core Foundation (2026-11)
- Data integrity: seed no longer re-creates edited employees (root cause of duplicates); duplicates/test users flagged (not deleted) and excluded from reporting; employee status history; Employee ID uniqueness.
- Permissions: computed live from roles + extra_permissions; no self-elevation; only Super Admin assigns System Administrator / edits roles; User Onboarding Admin no longer gets target access; new perms TARGETS_APPROVE, KPI_ACTUAL_SELF_UPDATE, KPI_ACTUAL_VALIDATE, TEAM_PERFORMANCE_VIEW.
- Single calculation source (`metrics.py`) used by dashboards + scorecards; credit split shares; dept totals counted once per opportunity; 10 pipeline stages.
- Dashboard: common structure with tabs — My Performance (10 KPI cards + 8 charts + personal actions), Department (filters: period, employee, stage, service category), Employee View, System (super admin).
- Targets & KPIs: KPI Library (85 KPIs, 10 categories, custom KPIs), 433 blank assignments mapped by responsibility, scorecard with configurable thresholds + weighted score, auto vs manual KPIs, self-entered actuals → HOD validation, individual + department targets with monthly split, revision → approval (no self-approval), history.
- Header global search + notifications; audit log with module / record / previous / new values.
- Tests: iteration_2 (13/13 backend, UI flows) + iteration_3 (7/7 fixes, 100% UI).

## Remaining phases (agreed with user)
- DONE (2026-11): Opportunity Kanban board (drag-drop, Won requires PO ref, Lost/On Hold require reason, inactivity flag), one-click lead → account + opportunity conversion, auto Lead ID + duplicate lead detection.
- DONE (2026-11, Master Spec Phase 1): employees see Department SUMMARY only (aggregates, no individual rows) — enforced in /api/dashboard/department; Super Admin toggle /api/settings/visibility; employees enter only their OWN KPI actuals (HOD/admin can no longer enter actuals for others).
- NEXT per Master Spec (awaiting approval): Phase 2 employee delete/archive + 7-KPI default assignments + 100% weight validation + monthly scorecard submission/approval & locking; Phase 3 Teams-style calendar + daily activity panel + midnight IST locking + HOD correction window (default 24h) + Super Admin override; Phase 4 shared Accounts/Leads import engine; Phase 5 reports with filters + Excel/CSV/PDF export.
- Phase 2 — Sales execution: expanded Leads/Accounts/Opportunities fields, Kanban, lead→account→opportunity conversion, Won requires PO/evidence, Lost/On-Hold reasons, duplicate detection, stage ageing.
- Phase 3 — Calendar & Activities: daily sales meeting (Mon–Sat excl. 2nd Saturday, 10:00–10:30), fortnightly reviews (16th & 2nd), personal/department views, reminders, activity → KPI updates.
- Phase 4 — Marketing & Reports: campaign expansion + attribution (attributed/influenced/unattributed), marketing calendar, reports with Excel/PDF export.
- Phase 5 — Validation: security sweep, data cleanup review, cross-module figure consistency.

## Phase 2 — DONE (2026-11-12)
- Backup before Phase 2: /app/backups/20261112-093321-pre-phase2 (476K).
- Employee Archive/Restore (reason required, history kept, login blocked) + permanent Delete (Super Admin only, typed email confirm, refused if any history). `phase2_routes.py`, Users.jsx.
- 7 core KPIs per employee by responsibility (`CORE_KPI_PROFILES` in kpi_catalog.py, `is_core` flag); other assignments kept as optional and excluded from weighted score; core weightage must total 100% (PUT /api/kpi/core-weights/{uid}, HOD only, not self). UI: CoreWeights.jsx + Core column in AssignmentsTab.
- Monthly scorecard workflow (`monthly_scorecards` collection): submit → approve / reject(reason) / reopen(reason). Routing: HOD's card → settings.scorecard_approvers.hod_approver_id (Kiran, Operations; configurable by Super Admin); all others → HOD. Super Admin has no approval authority by role. Submitted/approved month locks manual KPI actual entry. All decisions audited. No evidence attachments (postponed).
- Tests: iteration_4 + backend/tests/test_phase2_workflow.py (17/17 after fix). Test data cleaned up (weights, scorecards, actuals reset); audit-log entries of the test run remain.
- Known limitations: approver fixed at submission time; single active HOD assumed; KPI actuals are FY-level values (snapshot stored at submission).

## Phase 3 — Calendar & Daily Activity — DONE (2026-11-12)
- Nav: "Calendar & Activities" (CalendarDays) + "Daily Activity" (ClipboardList) added to Shell NAV, styling unchanged.
- Calendar (`activity_routes.py`, pages/Calendar.jsx, components/calendar/*): Year/Month/Week/Day/Agenda, prev/next/Today, My vs Team scope, type filter, create/edit/complete/delete; stored in existing `activities` collection (feeds KPI metrics). Colleagues' PRIVATE items -> "Busy"; HOD & Super Admin full detail in Team scope. Virtual read-only system events: Daily Sales Meeting Mon–Sat excl. 2nd Saturday 10:00–10:30 IST; Fortnightly Review 2nd & 16th 11:00–12:00 IST.
- Daily Activity (`daily_routes.py`, pages/DailyActivity.jsx, components/daily/*): structured report (auto employee header, entries w/ CRM link, pending+delay reason, support, next-day plan, attachments via Emergent object storage `storage.py`), system counts from CRM/calendar + manual counts only for site visits/emails/other; prefill from completed calendar items; editable until 23:59:59 IST then locked (server time check, Asia/Kolkata); HOD approve/return; correction request -> HOD -> 24h window; Super Admin monitoring only. Collections: daily_reports (unique user_id+date), daily_corrections.
- PUT /api/settings/scorecard-approvers REMOVED (approval hierarchy not editable by Super Admin).
- Tests: iteration_5 + backend/tests/test_calendar_daily.py. Test data removed afterwards (activities/daily_reports/daily_corrections emptied); audit entries remain.
- Limitations: no push/email reminders yet (reminder stored only); no recurring user events; HOD's own daily report has no reviewer (Super Admin monitors).

## Backlog
- P1: Advanced reports with Excel/CSV import/export and date-range comparisons.
- P1: Content calendar + lead attribution charts in Marketing module.
- P1: Approval workflows (opportunity closure, target assignment).
- P2: Notification settings.
- P2: FY configuration UI (currently hardcoded to FY2026-27 default).
- P2: Custom role editor UI (API exists; UI pending).

## Test credentials
- `kiran@focusengineering.in` / `Kiran@123` (bootstrap). First login forces password change.
- Seeded team members are locked — admin must resend invite from Users page.
