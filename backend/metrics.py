"""Single source of truth for all performance calculations (dashboard, scorecard, reports)."""
from __future__ import annotations

from datetime import date, datetime, timezone

STAGES = ["New", "Contacted", "Qualified", "Meeting / Discovery", "Solution Development",
          "Proposal Submitted", "Negotiation", "Won", "Lost", "On Hold"]
OPEN_STAGES = STAGES[:7]
QUALIFIED_OPEN = ["Qualified", "Meeting / Discovery", "Solution Development", "Proposal Submitted", "Negotiation"]
LEGACY_STAGE_MAP = {"Qualification": "Qualified", "Proposal": "Proposal Submitted"}
QUALIFIED_LEAD_STATUSES = {"Qualified", "Converted"}
DEPT_TARGET_KEY = "DEPARTMENT"


def fy_range(fy_code: str) -> tuple[str, str]:
    start_year = int(fy_code[2:6])
    return f"{start_year}-04-01", f"{start_year + 1}-03-31"


def fy_months(fy_code: str) -> list[str]:
    y = int(fy_code[2:6])
    return [f"{y}-{m:02d}" for m in range(4, 13)] + [f"{y + 1}-{m:02d}" for m in range(1, 4)]


def period_range(fy_code: str, month: str | None = None, quarter: str | None = None) -> tuple[str, str]:
    start, end = fy_range(fy_code)
    months = fy_months(fy_code)
    if month and month in months:
        y, m = int(month[:4]), int(month[5:7])
        nxt = date(y + (m == 12), (m % 12) + 1, 1)
        last = date.fromordinal(nxt.toordinal() - 1)
        return f"{month}-01", last.isoformat()
    if quarter in ("Q1", "Q2", "Q3", "Q4"):
        q = int(quarter[1]) - 1
        qm = months[q * 3:(q + 1) * 3]
        s, _ = period_range(fy_code, qm[0])
        _, e = period_range(fy_code, qm[-1])
        return s, e
    return start, end


def in_range(iso: str | None, start: str, end: str) -> bool:
    return bool(iso) and start <= iso[:10] <= end


def confirmed_date(o: dict) -> str | None:
    return o.get("confirmed_order_date") or o.get("updated_at")


def splits(o: dict) -> list[dict]:
    return o.get("contributors") or [{"user_id": o.get("primary_owner_id"), "credit_pct": 100.0}]


def share_of(o: dict, uid: str) -> float:
    for c in splits(o):
        if c.get("user_id") == uid:
            return float(c.get("credit_pct") or 0) / 100.0
    return 0.0


def pct(num: float, den: float) -> float | None:
    return round(num / den * 100.0, 2) if den else None


async def excluded_user_ids(db) -> set[str]:
    return {u["id"] async for u in db.users.find(
        {"$or": [{"is_test": True}, {"is_duplicate": True}]}, {"id": 1})}


async def approved_target(db, uid: str, fy_code: str) -> dict:
    return await db.targets.find_one({"user_id": uid, "fy_code": fy_code}, {"_id": 0}) or {}


async def user_metrics(db, uid: str, fy_code: str, start: str, end: str,
                       opps: list | None = None, stage: str | None = None, category: str | None = None) -> dict:
    if opps is None:
        opps = [o async for o in db.opportunities.find({}, {"_id": 0})]
    mine = [o for o in opps if share_of(o, uid) > 0]
    if stage:
        mine = [o for o in mine if o.get("stage") == stage]
    if category:
        mine = [o for o in mine if o.get("service_category") == category]

    months = fy_months(fy_code)
    trend = {m: 0.0 for m in months}
    won_val = won_cnt = lost_cnt = lost_reason = 0
    pipeline = weighted = 0.0
    prop_cnt, prop_val, created = 0, 0.0, 0
    funnel = {s: {"stage": s, "count": 0, "value_inr": 0.0} for s in STAGES}
    for o in mine:
        sh = share_of(o, uid)
        val = float(o.get("value_inr") or 0) * sh
        st = o.get("stage")
        if st in funnel:
            funnel[st]["count"] += 1
            funnel[st]["value_inr"] += val
        if st == "Won" and in_range(confirmed_date(o), start, end):
            won_val += val
            won_cnt += 1
        cd = confirmed_date(o)
        if st == "Won" and cd and cd[:7] in trend:
            trend[cd[:7]] += val
        if st == "Lost" and in_range(o.get("updated_at"), start, end):
            lost_cnt += 1
            lost_reason += 1 if (o.get("won_lost_reason") or o.get("lost_reason")) else 0
        if st in OPEN_STAGES:
            pipeline += val
            weighted += val * float(o.get("probability") or 0) / 100.0
        if in_range(o.get("proposal_submitted_at"), start, end):
            prop_cnt += 1
            prop_val += float(o.get("proposal_value_inr") or o.get("value_inr") or 0) * sh
        if o.get("primary_owner_id") == uid and in_range(o.get("created_at"), start, end):
            created += 1

    leads = [l async for l in db.leads.find({"owner_id": uid, "is_duplicate": {"$ne": True}}, {"_id": 0})]
    leads_p = [l for l in leads if in_range(l.get("created_at"), start, end)]
    qualified = [l for l in leads_p if l.get("status") in QUALIFIED_LEAD_STATUSES
                 or l.get("qualification_status") == "Qualified"]
    by_source: dict[str, int] = {}
    lead_trend = {m: {"month": m, "leads": 0, "qualified": 0} for m in months}
    for l in leads_p:
        by_source[l.get("source") or "Other"] = by_source.get(l.get("source") or "Other", 0) + 1
    for l in leads:
        m = (l.get("created_at") or "")[:7]
        if m in lead_trend:
            lead_trend[m]["leads"] += 1
            if l.get("status") in QUALIFIED_LEAD_STATUSES or l.get("qualification_status") == "Qualified":
                lead_trend[m]["qualified"] += 1

    acts = [a async for a in db.activities.find({"assigned_to": uid}, {"_id": 0})]
    now = datetime.now(timezone.utc).isoformat()
    def done(a, t):
        return a.get("activity_type") == t and a.get("status") == "Completed" and in_range(a.get("start_at"), start, end)
    meetings = sum(1 for a in acts if done(a, "Customer Meeting"))
    calls = sum(1 for a in acts if done(a, "Sales Call"))
    fu = [a for a in acts if a.get("activity_type") == "Follow-up"]
    fu_due = [a for a in fu if in_range(a.get("end_at") or a.get("start_at"), start, end) and (a.get("end_at") or a.get("start_at")) <= now]
    fu_ontime = sum(1 for a in fu_due if a.get("status") == "Completed" and (a.get("completed_at") or "") <= (a.get("end_at") or a.get("start_at") or ""))
    pending_fu = sum(1 for a in fu if a.get("status") not in ("Completed", "Cancelled"))
    overdue = sum(1 for a in acts if a.get("status") not in ("Completed", "Cancelled") and (a.get("end_at") or a.get("start_at") or "9") < now)
    act_by_type: dict[str, int] = {}
    for a in acts:
        if a.get("status") == "Completed" and in_range(a.get("start_at"), start, end):
            act_by_type[a.get("activity_type")] = act_by_type.get(a.get("activity_type"), 0) + 1

    tgt = await approved_target(db, uid, fy_code)
    target = float(tgt.get("sales_target_inr") or 0) or None
    return {
        "user_id": uid,
        "target_inr": target,
        "monthly_targets": tgt.get("monthly_targets") or {},
        "confirmed_won_inr": round(won_val, 2),
        "achievement_pct": pct(won_val, target or 0),
        "remaining_inr": round(max((target or 0) - won_val, 0), 2) if target else None,
        "won_count": won_cnt,
        "lost_count": lost_cnt,
        "lost_with_reason": lost_reason,
        "pipeline_inr": round(pipeline, 2),
        "weighted_pipeline_inr": round(weighted, 2),
        "open_count": sum(1 for o in mine if o.get("stage") in OPEN_STAGES),
        "opp_created": created,
        "proposals_submitted": prop_cnt,
        "proposal_value_inr": round(prop_val, 2),
        "win_rate_pct": pct(won_cnt, won_cnt + lost_cnt),
        "avg_deal_inr": round(won_val / won_cnt, 2) if won_cnt else None,
        "leads_total": len(leads_p),
        "leads_qualified": len(qualified),
        "lead_qualification_pct": pct(len(qualified), len(leads_p)),
        "leads_by_source": [{"source": k, "count": v} for k, v in by_source.items()],
        "lead_trend": list(lead_trend.values()),
        "meetings_completed": meetings,
        "calls_completed": calls,
        "followups_pending": pending_fu,
        "followup_compliance_pct": pct(fu_ontime, len(fu_due)),
        "followups_completed": sum(1 for a in fu if a.get("status") == "Completed"),
        "overdue_activities": overdue,
        "activity_by_type": [{"type": k, "count": v} for k, v in act_by_type.items()],
        "monthly_trend": [{"month": m, "won_inr": round(v, 2),
                           "target_inr": float((tgt.get("monthly_targets") or {}).get(m) or 0) or None}
                          for m, v in trend.items()],
        "funnel": list(funnel.values()),
    }
