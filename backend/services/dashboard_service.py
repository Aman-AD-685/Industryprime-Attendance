from __future__ import annotations

from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

from database.supabase_client import SupabaseRest, get_supabase


def get_dashboard_summary(
    for_date: date | None = None,
    tenant_id: str | None = None,
    supabase: SupabaseRest | None = None,
) -> Dict[str, Any]:
    """
    Premium KPI baseline for Phase 2.
    """
    if supabase is None:
        supabase = get_supabase()
    d = for_date or date.today()
    ds = str(d)
    _ = tenant_id  # Phase 2 tables are not tenant-scoped in SQL; param kept for API compatibility.

    def _employee_count() -> int:
        try:
            return supabase.count_rows(table="employees")
        except Exception:
            rows = supabase.select(table="employees", select="id", limit=5000)
            return len(rows or [])

    def _attendance_today() -> List[Dict[str, Any]]:
        try:
            return supabase.select(
                table="attendance",
                select="employee_id,late_minutes",
                where_eq={"date": ds},
                limit=5000,
            )
        except RuntimeError:
            return []

    def _link_today() -> List[Dict[str, Any]]:
        try:
            return supabase.select(
                table="attendance_link_entries",
                select="user_id",
                where_eq={"date": ds},
                limit=500,
            )
        except RuntimeError:
            return []

    with ThreadPoolExecutor(max_workers=4) as pool:
        fut_emp = pool.submit(_employee_count)
        fut_att = pool.submit(_attendance_today)
        fut_links = pool.submit(_link_today)
        fut_pending = pool.submit(_count_pending_leave_requests, supabase, tenant_id)
        total_employees = fut_emp.result()
        attendance_data = fut_att.result()
        link_rows = fut_links.result()
        pending_leave_requests = fut_pending.result()

    present_ids: Set[str] = set()
    for r in attendance_data:
        eid = r.get("employee_id")
        if eid:
            present_ids.add(str(eid))
    for r in link_rows or []:
        uid = r.get("user_id")
        if uid:
            present_ids.add(str(uid))

    present_today = len(present_ids)
    late = sum(1 for r in attendance_data if (r.get("late_minutes") or 0) > 0)
    absent = max(0, total_employees - present_today)

    return {
        "total_employees": total_employees,
        "present_today": present_today,
        "absent": absent,
        "late": late,
        "as_of": str(d),
        "pending_leave_requests": pending_leave_requests,
    }


def _count_pending_leave_requests(supabase: SupabaseRest, tenant_id: Optional[str]) -> int:
    from services.leave_service import is_pending_leave_request, list_leave_requests_for_tenant

    rows = list_leave_requests_for_tenant(
        status="pending",
        tenant_id=tenant_id,
        supabase=supabase,
        limit=500,
    )
    return len([r for r in rows if is_pending_leave_request(r)])


def _day_present_ids(
    attendance_rows: List[Dict[str, Any]],
    link_rows: List[Dict[str, Any]],
    day: str,
) -> Set[str]:
    present: Set[str] = set()
    for r in attendance_rows:
        if str(r.get("date") or "")[:10] != day:
            continue
        eid = r.get("employee_id")
        if eid:
            present.add(str(eid))
    for r in link_rows:
        if str(r.get("date") or "")[:10] != day:
            continue
        uid = r.get("user_id")
        if uid:
            present.add(str(uid))
    return present


def _late_count_for_day(attendance_rows: List[Dict[str, Any]], day: str) -> int:
    n = 0
    for r in attendance_rows:
        if str(r.get("date") or "")[:10] != day:
            continue
        if int(r.get("late_minutes") or 0) > 0:
            n += 1
    return n


def get_attendance_trend(
    *,
    days: int,
    supabase: SupabaseRest,
) -> List[Dict[str, Any]]:
    """Daily present / late / absent counts (same presence rules as summary)."""
    days = max(1, min(int(days), 90))
    end = date.today()
    start = end - timedelta(days=days - 1)

    try:
        total_employees = supabase.count_rows(table="employees")
    except Exception:
        employees_data = supabase.select(table="employees", select="id", limit=5000)
        total_employees = len(employees_data or [])

    try:
        attendance_rows = supabase.select(
            table="attendance",
            select="employee_id,date,late_minutes",
            where_gte={"date": str(start)},
            where_lte={"date": str(end)},
            limit=None,
        )
    except RuntimeError:
        attendance_rows = []

    try:
        link_rows = supabase.select(
            table="attendance_link_entries",
            select="user_id,date",
            where_gte={"date": str(start)},
            where_lte={"date": str(end)},
            limit=5000,
        )
    except RuntimeError:
        link_rows = []

    out: List[Dict[str, Any]] = []
    d = start
    while d <= end:
        ds = str(d)
        present = len(_day_present_ids(attendance_rows, link_rows, ds))
        late = _late_count_for_day(attendance_rows, ds)
        absent = max(0, total_employees - present)
        out.append({"date": ds, "present": present, "late": late, "absent": absent})
        d += timedelta(days=1)
    return out


def get_department_present_today(
    *,
    for_date: Optional[date],
    supabase: SupabaseRest,
) -> List[Dict[str, Any]]:
    d = for_date or date.today()
    ds = str(d)

    try:
        attendance_data = supabase.select(
            table="attendance",
            select="employee_id",
            where_eq={"date": ds},
            limit=None,
        )
    except RuntimeError:
        attendance_data = []

    present_ids: Set[str] = set()
    for r in attendance_data:
        eid = r.get("employee_id")
        if eid:
            present_ids.add(str(eid))
    try:
        link_rows = supabase.select(
            table="attendance_link_entries",
            select="user_id",
            where_eq={"date": ds},
            limit=500,
        )
        for r in link_rows or []:
            uid = r.get("user_id")
            if uid:
                present_ids.add(str(uid))
    except RuntimeError:
        pass

    if not present_ids:
        return []

    try:
        employees = supabase.select_where_in(
            table="employees",
            column="id",
            values=present_ids,
            select="id,department",
        )
    except RuntimeError:
        return []

    counts: Dict[str, int] = defaultdict(int)
    for emp in employees:
        eid = str(emp.get("id") or "")
        if eid not in present_ids:
            continue
        dept = str(emp.get("department") or "").strip() or "Unassigned"
        counts[dept] += 1

    return [{"name": name, "count": c} for name, c in sorted(counts.items(), key=lambda x: (-x[1], x[0]))]


def _format_check_in(raw: Any) -> str:
    if raw is None:
        return "—"
    s = str(raw).strip()
    if not s:
        return "—"
    trials: List[Tuple[str, str]] = []
    if len(s) >= 8:
        trials.append((s[:8], "%H:%M:%S"))
    trials.append((s[:5], "%H:%M"))
    for part, fmt in trials:
        try:
            t = datetime.strptime(part, fmt)
            out = t.strftime("%I:%M %p")
            return out.lstrip("0").replace(" 0", " ", 1)
        except ValueError:
            continue
    return s


_AVATAR_PALETTE = (
    "bg-red-100",
    "bg-blue-100",
    "bg-amber-100",
    "bg-purple-100",
    "bg-emerald-100",
    "bg-cyan-100",
    "bg-rose-100",
    "bg-indigo-100",
)


def _avatar_class(seed: str) -> str:
    h = sum(ord(c) for c in seed) if seed else 0
    return _AVATAR_PALETTE[h % len(_AVATAR_PALETTE)]


def get_late_arrivals_today(
    *,
    for_date: Optional[date],
    department: Optional[str],
    supabase: SupabaseRest,
) -> List[Dict[str, Any]]:
    d = for_date or date.today()
    ds = str(d)
    dept_filter = (department or "").strip()

    try:
        rows = supabase.select(
            table="attendance",
            select="id,employee_id,check_in,late_minutes,date",
            where_eq={"date": ds},
            where_gte={"late_minutes": 1},
            limit=500,
        )
    except RuntimeError:
        return []

    late_rows = [r for r in rows if int(r.get("late_minutes") or 0) > 0]
    if not late_rows:
        return []

    employee_ids = {str(r.get("employee_id") or "") for r in late_rows if r.get("employee_id")}
    try:
        employees = supabase.select_where_in(
            table="employees",
            column="id",
            values=employee_ids,
            select="id,name,employee_code,department",
        )
    except RuntimeError:
        employees = []

    by_id = {str(e.get("id")): e for e in employees}
    out: List[Dict[str, Any]] = []
    for r in late_rows:
        eid = str(r.get("employee_id") or "")
        emp = by_id.get(eid, {})
        dept = str(emp.get("department") or "").strip() or "Unassigned"
        if dept_filter and dept != dept_filter:
            continue
        code = str(emp.get("employee_code") or eid[:8] or "")
        name = str(emp.get("name") or "Employee").strip() or "Employee"
        rid = str(r.get("id") or f"late-{eid}")
        out.append(
            {
                "id": rid,
                "empId": code,
                "name": name,
                "dept": dept,
                "checkIn": _format_check_in(r.get("check_in")),
                "lateMinutes": int(r.get("late_minutes") or 0),
                "avatarColor": _avatar_class(rid),
            }
        )
    out.sort(key=lambda x: -int(x.get("lateMinutes") or 0))
    return out


def get_pending_leaves_dashboard(
    *,
    tenant_id: Optional[str],
    supabase: SupabaseRest,
    limit: int = 80,
) -> List[Dict[str, Any]]:
    from services.leave_service import is_pending_leave_request, list_leave_requests_for_tenant

    lim = max(1, min(int(limit), 200))
    rows = list_leave_requests_for_tenant(
        status="pending",
        tenant_id=tenant_id,
        supabase=supabase,
        limit=lim,
    )
    rows = [r for r in rows if is_pending_leave_request(r)][:lim]

    employee_ids = {str(r.get("employee_id") or "") for r in rows if r.get("employee_id")}
    try:
        employees = (
            supabase.select_where_in(
                table="employees",
                column="id",
                values=employee_ids,
                select="id,name,employee_code,department",
            )
            if employee_ids
            else []
        )
    except RuntimeError:
        employees = []

    by_id = {str(e.get("id")): e for e in employees}
    by_code = {str(e.get("employee_code") or ""): e for e in employees if e.get("employee_code")}

    def _norm_leave_type(raw: Any) -> str:
        s = str(raw or "").lower().strip()
        if "sick" in s:
            return "sick"
        if "earn" in s or "privilege" in s or "annual" in s:
            return "earned"
        return "casual"

    out: List[Dict[str, Any]] = []
    for r in rows:
        eid = str(r.get("employee_id") or "")
        emp = by_id.get(eid, {})
        if not emp.get("id") and r.get("employee_code"):
            emp = by_code.get(str(r.get("employee_code")), {}) or emp
        dept = str(emp.get("department") or "").strip() or "Unassigned"
        name = str(r.get("employee_name") or emp.get("name") or "Employee").strip() or "Employee"
        code = str(r.get("employee_code") or emp.get("employee_code") or eid[:8] or "")
        start = str(r.get("leave_date_start") or r.get("start_date") or "")[:10]
        end_d = str(r.get("leave_date_end") or r.get("end_date") or start)[:10]
        days = r.get("days")
        if days is None:
            try:
                ds = date.fromisoformat(start)
                de = date.fromisoformat(end_d)
                days = max(1, (de - ds).days + 1)
            except Exception:
                days = 1
        out.append(
            {
                "id": str(r.get("id")),
                "empId": code,
                "name": name,
                "dept": dept,
                "type": _norm_leave_type(r.get("leave_type") or r.get("type")),
                "from": start,
                "to": end_d,
                "days": float(days),
                "reason": str(r.get("reason") or "").strip() or "—",
            }
        )
    return out


def get_audit_events_dashboard(*, supabase: SupabaseRest, limit: int = 40) -> List[Dict[str, Any]]:
    lim = max(1, min(int(limit), 100))
    try:
        rows = supabase.select(
            table="audit_events",
            select="id,actor_email,action,target_id,metadata,created_at",
            where_eq=None,
            order="created_at.desc",
            limit=lim,
        )
    except Exception:
        return []

    out: List[Dict[str, Any]] = []
    for r in rows or []:
        actor = str(r.get("actor_email") or "system")
        out.append(
            {
                "id": str(r.get("id")),
                "ts": str(r.get("created_at") or ""),
                "actor": actor,
                "action": str(r.get("action") or ""),
                "target": str(r.get("target_id") or ""),
                "payload": r.get("metadata") if isinstance(r.get("metadata"), dict) else {},
            }
        )
    return out

