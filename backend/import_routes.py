"""Shared Excel/CSV import engine for Leads and Accounts: template, mapping, validation, duplicates, preview, confirm, history."""
from __future__ import annotations

import csv
import io
import json
import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from auth import get_current_user, has_permission
from core import audit, db, now_iso

router = APIRouter(prefix="/api")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
SPEC = {
    "leads": {"perm": "SALES_LEAD_MANAGE", "fields": [
        ("name", "Contact Name", True, ["contact", "contact name", "lead name", "name"]),
        ("company", "Company", True, ["company", "company name", "organisation", "organization"]),
        ("email", "Email", False, ["email", "email id", "e-mail"]),
        ("phone", "Phone", False, ["phone", "mobile", "contact number", "phone number"]),
        ("source", "Source", False, ["source", "lead source"]),
        ("status", "Status", False, ["status", "lead status"]),
        ("owner", "Lead Owner", True, ["lead owner", "owner", "owner email", "assigned to"]),
        ("notes", "Notes", False, ["notes", "remarks", "comments"])]},
    "accounts": {"perm": "SALES_ACCOUNT_MANAGE", "fields": [
        ("name", "Account Name", True, ["account name", "company", "company name", "name"]),
        ("industry", "Industry", False, ["industry", "sector"]),
        ("city", "City", False, ["city", "location"]),
        ("primary_contact", "Primary Contact", False, ["primary contact", "contact", "contact name"]),
        ("primary_contact_email", "Contact Email", False, ["contact email", "email"]),
        ("primary_contact_phone", "Contact Phone", False, ["contact phone", "phone", "mobile"]),
        ("owner", "Account Owner", True, ["account owner", "owner", "owner email", "assigned to"])]},
}
LEAD_STATUSES = {"new", "contacted", "qualified", "unqualified", "nurturing", "converted", "lost"}
MAX_ROWS = 2000


def _spec(entity: str, user: dict) -> dict:
    sp = SPEC.get(entity)
    if not sp:
        raise HTTPException(status_code=404, detail="Unknown import type")
    if not has_permission(user, sp["perm"]):
        raise HTTPException(status_code=403, detail="You do not have permission to manage these records")
    return sp


def _oversight(user: dict) -> bool:
    return bool(user.get("is_super_admin")) or user.get("data_visibility") in ("DEPARTMENT", "ALL") or has_permission(user, "HOD_VIEW")


@router.get("/imports/template/{entity}")
async def template(entity: str, format: str = "csv", user: dict = Depends(get_current_user)):
    sp = _spec(entity, user)
    heads = [f[1] for f in sp["fields"]]
    sample = {"leads": ["Ravi Kumar", "Acme Industries", "ravi@acme.example", "9876543210", "Referral", "New", user["email"], ""],
              "accounts": ["Acme Industries", "Manufacturing", "Pune", "Ravi Kumar", "ravi@acme.example", "9876543210", user["email"]]}[entity]
    if format == "xlsx":
        from openpyxl import Workbook
        wb = Workbook()
        ws = wb.active
        ws.append(heads)
        ws.append(sample)
        buf = io.BytesIO()
        wb.save(buf)
        return Response(buf.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": f'attachment; filename="{entity}_template.xlsx"'})
    out = io.StringIO()
    csv.writer(out).writerows([heads, sample])
    return Response(out.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{entity}_template.csv"'})


def _read(file_name: str, data: bytes) -> tuple[list[str], list[list[str]]]:
    if file_name.lower().endswith(".xlsx"):
        from openpyxl import load_workbook
        ws = load_workbook(io.BytesIO(data), read_only=True, data_only=True).active
        rows = [["" if c is None else str(c).strip() for c in r] for r in ws.iter_rows(values_only=True)]
    elif file_name.lower().endswith(".csv"):
        rows = [[c.strip() for c in r] for r in csv.reader(io.StringIO(data.decode("utf-8-sig", errors="replace")))]
    else:
        raise HTTPException(status_code=400, detail="Upload a .csv or .xlsx file")
    rows = [r for r in rows if any(r)]
    if not rows:
        raise HTTPException(status_code=400, detail="The file is empty")
    return rows[0], rows[1:]


def auto_map(sp: dict, headers: list[str]) -> dict:
    norm = {h.lower().strip(): h for h in headers}
    m = {}
    for key, label, _, aliases in sp["fields"]:
        for a in [label.lower(), *aliases]:
            if a in norm and norm[a] not in m.values():
                m[key] = norm[a]
                break
    return m


def _ci(v: str) -> dict:
    return {"$regex": f"^{re.escape(v.strip())}$", "$options": "i"}


def _digits(v: str) -> str:
    return re.sub(r"\D", "", v or "")[-10:]


async def _dup(entity: str, rec: dict) -> Optional[str]:
    if entity == "leads":
        q = [{"name": _ci(rec["name"]), "company": _ci(rec["company"])}]
        if rec.get("email"):
            q.append({"email": _ci(rec["email"])})
        if await db.leads.find_one({"$or": q}):
            return "Duplicate of an existing lead (same email or contact + company)"
        if rec.get("phone") and _digits(rec["phone"]):
            async for x in db.leads.find({"phone": {"$nin": [None, ""]}}, {"phone": 1}):
                if _digits(x["phone"]) == _digits(rec["phone"]):
                    return "Duplicate of an existing lead (same phone)"
    else:
        q = [{"name": _ci(rec["name"])}]
        if rec.get("primary_contact_email"):
            q.append({"primary_contact_email": _ci(rec["primary_contact_email"])})
        if await db.accounts.find_one({"$or": q}):
            return "Duplicate of an existing account (same company name or contact email)"
    return None


async def validate(entity: str, sp: dict, headers: list[str], rows: list[list[str]], mapping: dict, user: dict) -> list[dict]:
    idx = {k: headers.index(h) for k, h in mapping.items() if h in headers}
    users = [u async for u in db.users.find({"is_active": True, "is_test": {"$ne": True}, "is_duplicate": {"$ne": True}}, {"_id": 0, "id": 1, "name": 1, "email": 1})]
    seen, out = set(), []
    for n, r in enumerate(rows, start=2):
        rec = {k: (r[i] if i < len(r) else "").strip() for k, i in idx.items()}
        errs = [f"{lab} is required" for key, lab, req, _ in sp["fields"] if req and not rec.get(key)]
        for ek in ("email", "primary_contact_email"):
            if rec.get(ek) and not EMAIL_RE.match(rec[ek]):
                errs.append(f"Invalid email '{rec[ek]}'")
        owner = None
        if rec.get("owner"):
            owner = next((u for u in users if u["email"].lower() == rec["owner"].lower() or u["name"].lower() == rec["owner"].lower()), None)
            if not owner:
                errs.append(f"Owner '{rec['owner']}' is not an active employee")
            elif owner["id"] != user["id"] and not _oversight(user):
                errs.append("You can only import records you own; ask your HOD to import records for other owners")
        if entity == "leads" and rec.get("status") and rec["status"].lower() not in LEAD_STATUSES:
            errs.append(f"Unknown status '{rec['status']}'")
        status = "ERROR" if errs else "VALID"
        if not errs:
            key = (rec.get("email") or "").lower() or f"{rec['name'].lower()}|{rec.get('company', '').lower()}"
            reason = "Duplicate row within this file" if key in seen else await _dup(entity, rec)
            seen.add(key)
            if reason:
                status, errs = "DUPLICATE", [reason]
        out.append({"row": n, "data": rec, "owner_id": owner["id"] if owner else None, "owner_name": owner["name"] if owner else None,
                    "status": status, "errors": errs})
    return out


def _summary(rows: list[dict]) -> dict:
    return {s: sum(1 for r in rows if r["status"] == s) for s in ("VALID", "DUPLICATE", "ERROR", "IMPORTED")} | {"total": len(rows)}


@router.post("/imports/preview/{entity}")
async def preview(entity: str, file: UploadFile = File(...), mapping: str = Form(""), user: dict = Depends(get_current_user)):
    sp = _spec(entity, user)
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File exceeds 5 MB")
    headers, rows = _read(file.filename or "", data)
    if len(rows) > MAX_ROWS:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_ROWS} rows per import")
    m = json.loads(mapping) if mapping else auto_map(sp, headers)
    missing = [lab for key, lab, req, _ in sp["fields"] if req and key not in m]
    checked = await validate(entity, sp, headers, rows, m, user) if not missing else []
    doc = {"id": str(uuid.uuid4()), "entity": entity, "file_name": file.filename, "status": "PREVIEW", "user_id": user["id"], "user_name": user["name"],
           "headers": headers, "mapping": m, "rows": checked, "summary": _summary(checked), "created_at": now_iso()}
    if not missing:
        await db.imports.insert_one(doc)
        doc.pop("_id", None)
    fields = [{"key": k, "label": lab, "required": req} for k, lab, req, _ in sp["fields"]]
    return {**doc, "rows": checked[:200], "missing_required": missing, "fields": fields}


@router.post("/imports/{iid}/confirm")
async def confirm(iid: str, user: dict = Depends(get_current_user)):
    imp = await db.imports.find_one({"id": iid}, {"_id": 0})
    if not imp or imp["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Import not found")
    if imp["status"] != "PREVIEW":
        raise HTTPException(status_code=400, detail="This import has already been processed")
    _spec(imp["entity"], user)
    rows, n = imp["rows"], 0
    for r in rows:
        if r["status"] != "VALID":
            continue
        reason = await _dup(imp["entity"], r["data"])
        if reason:
            r.update(status="DUPLICATE", errors=[reason])
            continue
        d = {k: v for k, v in r["data"].items() if k != "owner"}
        base = {"id": str(uuid.uuid4()), "owner_id": r["owner_id"], "created_at": now_iso(), "updated_at": now_iso(), "created_by": user["id"], "import_id": iid}
        if imp["entity"] == "leads":
            cnt = await db.leads.count_documents({}) + 1
            doc = {**base, "lead_code": f"LD-{cnt:05d}", "name": d["name"], "company": d["company"], "email": d.get("email") or None,
                   "phone": d.get("phone") or None, "source": d.get("source") or "Outbound", "campaign_id": None,
                   "status": (d.get("status") or "New").title(), "notes": d.get("notes", "")}
            await db.leads.insert_one(doc)
        else:
            doc = {**base, "name": d["name"], "industry": d.get("industry", ""), "city": d.get("city", ""), "primary_contact": d.get("primary_contact", ""),
                   "primary_contact_email": d.get("primary_contact_email") or None, "primary_contact_phone": d.get("primary_contact_phone", "")}
            await db.accounts.insert_one(doc)
        r.update(status="IMPORTED", record_id=doc["id"])
        n += 1
    summ = _summary(rows)
    await db.imports.update_one({"id": iid}, {"$set": {"status": "COMPLETED", "rows": rows, "summary": summ, "completed_at": now_iso()}})
    await audit(user, "BULK_IMPORT_COMPLETED", imp["entity"], iid, details={"file": imp["file_name"], **summ})
    return {"id": iid, "status": "COMPLETED", "summary": summ}


@router.get("/imports")
async def history(entity: Optional[str] = None, user: dict = Depends(get_current_user)):
    flt: dict = {} if (user.get("is_super_admin") or has_permission(user, "HOD_VIEW")) else {"user_id": user["id"]}
    if entity:
        flt["entity"] = entity
    return [i async for i in db.imports.find(flt, {"_id": 0, "rows": 0, "headers": 0}).sort("created_at", -1).limit(100)]


@router.get("/imports/{iid}/errors")
async def error_report(iid: str, user: dict = Depends(get_current_user)):
    imp = await db.imports.find_one({"id": iid}, {"_id": 0})
    if not imp or not (imp["user_id"] == user["id"] or user.get("is_super_admin") or has_permission(user, "HOD_VIEW")):
        raise HTTPException(status_code=404, detail="Import not found")
    keys = [k for k, *_ in SPEC[imp["entity"]]["fields"]]
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Row", "Status", "Issues", *[lab for _, lab, *_ in SPEC[imp["entity"]]["fields"]]])
    for r in imp["rows"]:
        if r["status"] in ("ERROR", "DUPLICATE"):
            w.writerow([r["row"], r["status"], "; ".join(r["errors"]), *[r["data"].get(k, "") for k in keys]])
    return Response(out.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="import_{iid[:8]}_errors.csv"'})
