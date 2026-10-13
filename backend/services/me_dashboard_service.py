from __future__ import annotations

from calendar import monthrange
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

from database.supabase_client import SupabaseRest

# Match attendance_management_service: IN at 9:31 or earlier is on time; 9:32+ is late.
_LATE_CUTOFF_MINUTES = 9 * 60 + 31


def _late_minutes_from_check_in(t_in: time) -> int:
    delta = t_in.hour * 60 + t_in.minute - _LATE_CUTOFF_MINUTES
    return 0 if delta <= 0 else int(delta)


def _parse_time(val: Any) -> Optional[time]:
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    try:
        return datetime.strptime(s[:8], "%H:%M:%S").time()
    except ValueError:
        try:
            return datetime.strptime(s[:5], "%H:%M").time()
        except ValueError:
            return None


def _combine_local(d: date, t: time) -> datetime:
    return datetime.combine(d, t)


def _weekday_working_days(start: date, end: date, holiday_dates: Set[date]) -> int:
    n = 0
    cur = start
    while cur <= end:
        if cur.weekday() < 5 and cur not in holiday_dates:
            n += 1
        cur += timedelta(days=1)
    return n


def _month_range(d: date) -> Tuple[date, date]:
    first = date(d.year, d.month, 1)
    last = date(d.year, d.month, monthrange(d.year, d.month)[1])
    return first, last


def _find_employee(supabase: SupabaseRest, email: str) -> Optional[Dict[str, Any]]:
    em = email.strip().lower()
    if not em:
        return None
    try:
        rows = supabase.select(
            table="employees",
            select="id,email,name,department,designation,created_at",
            where_eq=None,
            limit=None,
        )
    except Exception:
        return None
    for r in rows or []:
        if str(r.get("email") or "").strip().lower() == em:
            return r
    return None


def _holiday_dates_between(supabase: SupabaseRest, start: date, end: date) -> Set[date]:
    out: Set[date] = set()
    try:
        rows = supabase.select(
            table="holidays",
            select="holiday_date",
            where_gte={"holiday_date": str(start)},
            where_lte={"holiday_date": str(end)},
            limit=500,
        )
    except Exception:
        return out
    for r in rows or []:
        raw = r.get("holiday_date")
        if not raw:
            continue
        try:
            out.add(date.fromisoformat(str(raw)[:10]))
        except ValueError:
            continue
    return out


def _employee_leave_requests(supabase: SupabaseRest, employee_id: str) -> List[Dict[str, Any]]:
    """All leave requests for one employee (one fetch; sliced in memory by the helpers below)."""
    try:
        rows = supabase.select(
            table="leave_requests",
            select="leave_date_start,leave_date_end,leave_type,status,days,reason",
            where_eq={"employee_id": employee_id},
            order="leave_date_start.asc",
            limit=500,
        )
    except Exception:
        return []
    return list(rows or [])


def _approved_leave_dates(
    rows: List[Dict[str, Any]],
    start: date,
    end: date,
) -> Set[date]:
    """Calendar dates covered by approved leave in [start, end]."""
    out: Set[date] = set()
    for r in rows or []:
        if str(r.get("status") or "").lower() != "approved":
            continue
        try:
            sd = date.fromisoformat(str(r.get("leave_date_start"))[:10])
            ed = date.fromisoformat(str(r.get("leave_date_end") or r.get("leave_date_start"))[:10])
        except ValueError:
            continue
        cur = max(sd, start)
        last = min(ed, end)
        while cur <= last:
            out.add(cur)
            cur += timedelta(days=1)
    return out


def _count_late_arrivals(
    rows: List[Dict[str, Any]],
    *,
    holiday_dates: Set[date],
    leave_dates: Set[date],
) -> int:
    """
    Count working days with a real check-in after the 9:31 cutoff.
    Ignores stale `late_minutes` on absent/weekend/holiday/leave days.
    """
    n = 0
    for r in rows:
        try:
            dd = date.fromisoformat(str(r.get("date"))[:10])
        except ValueError:
            continue
        if dd.weekday() >= 5 or dd in holiday_dates or dd in leave_dates:
            continue
        cin = r.get("check_in")
        if cin is None or not str(cin).strip():
            continue
        st = str(r.get("final_status") or r.get("status") or "").lower()
        if st in {"absent", "leave", "holiday", "off", "weekend", "not_started"}:
            continue
        t_in = _parse_time(cin)
        if not t_in:
            continue
        if _late_minutes_from_check_in(t_in) > 0:
            n += 1
    return n


def _attendance_for_range(
    supabase: SupabaseRest,
    employee_id: str,
    start: date,
    end: date,
) -> List[Dict[str, Any]]:
    base: Dict[str, Any] = {"employee_id": employee_id}
    try:
        rows = supabase.select(
            table="attendance",
            select="*",
            where_eq=base,
            where_gte={"date": str(start)},
            where_lte={"date": str(end)},
            limit=500,
        )
    except Exception:
        return []
    return list(rows or [])


def _today_row(rows: List[Dict[str, Any]], today: date) -> Optional[Dict[str, Any]]:
    ts = str(today)
    for r in rows:
        if str(r.get("date") or "")[:10] == ts:
            return r
    return None


def _minutes_worked_today(row: Optional[Dict[str, Any]], today: date) -> Tuple[int, str, str, str]:
    """Returns (minutes, status, check_in_iso, check_out_iso)."""
    if not row:
        return 0, "not_started", "", ""

    cin = row.get("check_in")
    cout = row.get("check_out")
    t_in = _parse_time(cin)
    t_out = _parse_time(cout)

    check_in_iso = ""
    check_out_iso = ""
    if t_in:
        check_in_iso = _combine_local(today, t_in).isoformat()
    if t_out:
        check_out_iso = _combine_local(today, t_out).isoformat()

    if not t_in:
        return 0, "not_started", check_in_iso, check_out_iso

    if t_out:
        mins = max(0, int((_combine_local(today, t_out) - _combine_local(today, t_in)).total_seconds() // 60))
        return mins, "done", check_in_iso, check_out_iso

    now = datetime.now()
    start_dt = _combine_local(today, t_in)
    mins = max(0, int((now - start_dt).total_seconds() // 60))
    return mins, "working", check_in_iso, check_out_iso


def _leave_allocated(supabase: SupabaseRest, employee_id: str, year: int) -> float:
    try:
        bal = supabase.select(
            table="leave_balances",
            select="total_leave",
            where_eq={"employee_id": employee_id, "year": year},
            limit=1,
        )
        if bal:
            return float(bal[0].get("total_leave") or 0)
    except Exception:
        pass
    return 0.0


def _leave_balance_breakdown(allocated: float, reqs: List[Dict[str, Any]]) -> Tuple[float, float, str]:
    """(allocated, used_approved_days, breakdown label)."""
    used_by_type: Dict[str, float] = defaultdict(float)
    used_total = 0.0
    for r in reqs or []:
        st = str(r.get("status") or "").lower()
        if st != "approved":
            continue
        lt = str(r.get("leave_type") or "Leave").strip() or "Leave"
        d = float(r.get("days") or 0)
        used_by_type[lt] += d
        used_total += d

    if used_by_type:
        parts = [f"{k[:3]} {v:g}" for k, v in sorted(used_by_type.items(), key=lambda x: -x[1])[:4]]
        breakdown = " · ".join(parts)
    else:
        breakdown = "No approved leave usage this year" if allocated else "—"

    if allocated <= 0:
        allocated = max(18.0, used_total + 0.5, 1.0)
    return allocated, used_total, breakdown


def get_me_profile(*, supabase: SupabaseRest, auth_email: str) -> Dict[str, Any]:
    emp = _find_employee(supabase, auth_email)
    if not emp:
        return {"shift": "—", "location": "—", "joinedAt": "—"}
    dept = str(emp.get("department") or "").strip()
    des = str(emp.get("designation") or "").strip()
    shift = "General · 09:30–18:30"
    if des:
        shift = f"{des} · 09:30–18:30"
    loc = dept or "HQ"
    joined = str(emp.get("created_at") or "")[:10] or "—"
    return {"shift": shift, "location": loc, "joinedAt": joined}


def get_me_dashboard(*, supabase: SupabaseRest, auth_email: str, today: Optional[date] = None) -> Dict[str, Any]:
    d = today or date.today()
    emp = _find_employee(supabase, auth_email)
    if not emp:
        return _empty_dashboard(d)

    emp_id = str(emp.get("id"))
    first_m, last_m = _month_range(d)
    month_start = first_m
    month_end = min(d, last_m)
    seven_start = d - timedelta(days=6)
    prev_first = date(d.year, d.month, 1) - timedelta(days=1)
    prev_month_end = date(prev_first.year, prev_first.month, monthrange(prev_first.year, prev_first.month)[1])
    prev_month_start = date(prev_first.year, prev_first.month, 1)
    range_start = min(prev_month_start, seven_start)

    # Everything below is independent: fetch the whole prev-month..today window once, in
    # parallel, and slice per period in memory (one round trip instead of a dozen).
    with ThreadPoolExecutor(max_workers=5) as pool:
        fut_hol = pool.submit(_holiday_dates_between, supabase, range_start, month_end)
        fut_att = pool.submit(_attendance_for_range, supabase, emp_id, range_start, month_end)
        fut_reqs = pool.submit(_employee_leave_requests, supabase, emp_id)
        fut_alloc = pool.submit(_leave_allocated, supabase, emp_id, d.year)
        fut_next_h = pool.submit(_next_holiday, supabase, d)
        hol_all = fut_hol.result()
        att_all = fut_att.result()
        leave_reqs = fut_reqs.result()
        allocated_raw = fut_alloc.result()
        upcoming_h = fut_next_h.result()

    def _dates_between(days: Set[date], a: date, b: date) -> Set[date]:
        return {x for x in days if a <= x <= b}

    def _rows_between(rows: List[Dict[str, Any]], a: date, b: date) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for r in rows:
            try:
                dd = date.fromisoformat(str(r.get("date"))[:10])
            except ValueError:
                continue
            if a <= dd <= b:
                out.append(r)
        return out

    hol_m = _dates_between(hol_all, month_start, month_end)
    hol_7 = _dates_between(hol_all, seven_start, d)
    leave_m = _approved_leave_dates(leave_reqs, month_start, month_end)

    att_month = _rows_between(att_all, month_start, month_end)
    att_7 = _rows_between(att_all, seven_start, d)

    present_dates_m: Set[date] = set()
    hours_month: List[float] = []
    for r in att_month:
        try:
            dd = date.fromisoformat(str(r.get("date"))[:10])
        except ValueError:
            continue
        if r.get("check_in") is not None and str(r.get("check_in")).strip():
            present_dates_m.add(dd)
        wh = r.get("working_hours")
        if wh is not None:
            try:
                hours_month.append(float(wh))
            except (TypeError, ValueError):
                pass

    late_month = _count_late_arrivals(att_month, holiday_dates=hol_m, leave_dates=leave_m)

    expected_working = _weekday_working_days(month_start, month_end, hol_m)
    present_current = len(present_dates_m)

    prev_att = _rows_between(att_all, prev_month_start, prev_month_end)
    hol_prev = _dates_between(hol_all, prev_month_start, prev_month_end)
    leave_prev = _approved_leave_dates(leave_reqs, prev_month_start, prev_month_end)
    late_prev = _count_late_arrivals(prev_att, holiday_dates=hol_prev, leave_dates=leave_prev)

    allocated, used_leave, breakdown = _leave_balance_breakdown(allocated_raw, leave_reqs)
    avg_hours = sum(hours_month) / len(hours_month) if hours_month else 0.0
    target_hours = 8.0
    delta_avg = round(avg_hours - target_hours, 1) if hours_month else 0.0

    row_today = _today_row(att_month, d)
    mins, status, cin_iso, cout_iso = _minutes_worked_today(row_today, d)

    note_val: Optional[str] = None
    if row_today:
        note_val = row_today.get("employee_note")
        if note_val is not None:
            note_val = str(note_val).strip() or None

    loc = str(emp.get("department") or "").strip() or "HQ"
    shift_name = str(emp.get("designation") or "").strip() or "General shift"

    leave_7 = _approved_leave_dates(leave_reqs, seven_start, d)
    last7 = _build_last_7_days(d, att_7, hol_7, leave_7)

    upcoming_l = _next_leave(leave_reqs, d)

    return {
        "updatedAt": datetime.now().isoformat(),
        "today": {
            "status": status,
            "checkInAt": cin_iso or None,
            "checkOutAt": cout_iso or None,
            "location": loc,
            "shiftName": shift_name,
            "minutesWorked": mins,
            "targetMinutes": 540,
            "note": note_val,
        },
        "kpis": {
            "presentThisMonth": {"current": present_current, "total": max(1, expected_working)},
            "lateArrivals": {"count": late_month, "deltaVsPrevMonth": late_month - late_prev},
            "leaveBalance": {
                "total": allocated,
                "used": used_leave,
                "breakdown": breakdown,
            },
            "avgHoursPerDay": {"value": round(avg_hours, 1), "deltaVsTarget": delta_avg},
        },
        "last7Days": last7,
        "upcoming": {"nextHoliday": upcoming_h, "nextLeave": upcoming_l},
    }


def _empty_dashboard(d: date) -> Dict[str, Any]:
    return {
        "updatedAt": datetime.now().isoformat(),
        "today": {
            "status": "not_started",
            "checkInAt": None,
            "checkOutAt": None,
            "location": None,
            "shiftName": "—",
            "minutesWorked": 0,
            "targetMinutes": 540,
            "note": None,
        },
        "kpis": {
            "presentThisMonth": {"current": 0, "total": 1},
            "lateArrivals": {"count": 0, "deltaVsPrevMonth": 0},
            "leaveBalance": {"total": 0, "used": 0, "breakdown": "—"},
            "avgHoursPerDay": {"value": 0, "deltaVsTarget": 0},
        },
        "last7Days": _build_last_7_days(d, [], set(), set()),
        "upcoming": {"nextHoliday": None, "nextLeave": None},
    }


def _build_last_7_days(
    today: date,
    rows: List[Dict[str, Any]],
    holidays: Set[date],
    leave_dates: Set[date],
) -> List[Dict[str, Any]]:
    by_date = {str(r.get("date"))[:10]: r for r in rows}
    out: List[Dict[str, Any]] = []
    for i in range(6, -1, -1):
        dd = today - timedelta(days=i)
        key = str(dd)
        dow = dd.weekday()
        weekend = dow >= 5
        hol = dd in holidays
        on_leave = dd in leave_dates
        r = by_date.get(key)
        check_in = None
        check_out = None
        hours = 0.0
        status: str = "off"
        if weekend:
            status = "weekend"
        elif hol:
            status = "off"
        elif on_leave:
            status = "off"
        elif r:
            tin = _parse_time(r.get("check_in"))
            tout = _parse_time(r.get("check_out"))
            if tin:
                check_in = _combine_local(dd, tin).strftime("%H:%M")
            if tout:
                check_out = _combine_local(dd, tout).strftime("%H:%M")
            wh = r.get("working_hours")
            if wh is not None:
                try:
                    hours = float(wh)
                except (TypeError, ValueError):
                    hours = 0.0
            if tin and _late_minutes_from_check_in(tin) > 0:
                status = "late"
            elif tin:
                status = "present"
            else:
                st = str(r.get("final_status") or r.get("status") or "").lower()
                status = "absent" if st == "absent" else "off"
        out.append(
            {
                "date": key,
                "label": dd.strftime("%a %d"),
                "status": status,
                "checkIn": check_in,
                "checkOut": check_out,
                "hours": hours,
                "isToday": dd == today,
            }
        )
    return out


def _next_holiday(supabase: SupabaseRest, today: date) -> Optional[Dict[str, Any]]:
    try:
        rows = supabase.select(
            table="holidays",
            select="holiday_date,name",
            where_gte={"holiday_date": str(today)},
            order="holiday_date.asc",
            limit=1,
        )
    except Exception:
        return None
    if not rows:
        return None
    r = rows[0]
    hd = str(r.get("holiday_date") or "")[:10]
    title = str(r.get("name") or "Holiday")
    return {"date": hd, "title": title, "subline": "Office closed · plan leave accordingly"}


def _next_leave(rows: List[Dict[str, Any]], today: date) -> Optional[Dict[str, Any]]:
    for r in rows or []:
        st = str(r.get("status") or "").lower()
        if st not in {"approved", "pending"}:
            continue
        try:
            sd = date.fromisoformat(str(r.get("leave_date_start"))[:10])
            ed = date.fromisoformat(str(r.get("leave_date_end") or r.get("leave_date_start"))[:10])
        except ValueError:
            continue
        if ed < today:
            continue
        lt = str(r.get("leave_type") or "Leave")
        reason = str(r.get("reason") or "").strip()
        sub = lt if not reason else f"{lt} · {reason[:40]}"
        return {
            "startDate": str(r.get("leave_date_start"))[:10],
            "endDate": str(r.get("leave_date_end") or r.get("leave_date_start"))[:10],
            "title": "Leave request" if st == "pending" else "Approved leave",
            "subline": sub,
            "status": st.capitalize(),
        }
    return None


def save_me_note(
    *,
    supabase: SupabaseRest,
    auth_email: str,
    note: str,
    today: Optional[date] = None,
) -> str:
    d = today or date.today()
    emp = _find_employee(supabase, auth_email)
    if not emp:
        raise ValueError("Employee profile not linked to this account (match employees.email to your login email).")
    emp_id = str(emp.get("id"))
    clean = note.strip()[:500]
    try:
        updated = supabase.update_single(
            table="attendance",
            payload={"employee_note": clean or None},
            where_eq={"employee_id": emp_id, "date": str(d)},
        )
        if updated:
            return clean
    except Exception:
        pass
    raise RuntimeError("Could not save note (ensure attendance row exists for today and migration `attendance_employee_note.sql` is applied).")
