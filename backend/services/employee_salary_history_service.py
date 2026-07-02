from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple

from database.supabase_client import SupabaseRest

_HISTORY_SELECT = "id,employee_id,salary_monthly,effective_year,effective_month,created_at"
_BOOTSTRAP_YEAR = 2000
_BOOTSTRAP_MONTH = 1


def _period_key(year: int, month: int) -> Tuple[int, int]:
    return int(year), int(month)


def _period_lte(a: Tuple[int, int], b: Tuple[int, int]) -> bool:
    return a <= b


def _month_before(year: int, month: int) -> Tuple[int, int]:
    if month <= 1:
        return year - 1, 12
    return year, month - 1


def _fetch_history_for_employees(
    supabase: SupabaseRest,
    employee_ids: Set[str],
) -> Dict[str, List[Dict[str, Any]]]:
    if not employee_ids:
        return {}
    out: Dict[str, List[Dict[str, Any]]] = {eid: [] for eid in employee_ids}
    ids = sorted(employee_ids)
    chunk_size = 40
    try:
        for i in range(0, len(ids), chunk_size):
            chunk = ids[i : i + chunk_size]
            rows = supabase.select_where_in(
                table="employee_salary_history",
                column="employee_id",
                values=chunk,
                select=_HISTORY_SELECT,
                limit=500,
            )
            for row in rows or []:
                eid = str(row.get("employee_id") or "")
                if eid in out:
                    out[eid].append(row)
    except Exception:
        return {eid: [] for eid in employee_ids}
    for eid in employee_ids:
        out[eid].sort(
            key=lambda r: _period_key(int(r.get("effective_year") or 0), int(r.get("effective_month") or 0)),
            reverse=True,
        )
    return out


def resolve_salary_for_month(
    history_rows: List[Dict[str, Any]],
    *,
    month: int,
    year: int,
    fallback_salary: float,
) -> float:
    target = _period_key(year, month)
    for row in history_rows:
        key = _period_key(int(row.get("effective_year") or 0), int(row.get("effective_month") or 0))
        if _period_lte(key, target):
            return float(row.get("salary_monthly") or 0)
    return float(fallback_salary or 0)


def resolve_salaries_for_month(
    supabase: SupabaseRest,
    employee_rows: List[Dict[str, Any]],
    month: int,
    year: int,
) -> Dict[str, float]:
    emp_ids = {str(r.get("id")) for r in employee_rows if r.get("id")}
    history_by_eid = _fetch_history_for_employees(supabase, emp_ids)
    out: Dict[str, float] = {}
    for emp in employee_rows:
        eid = str(emp.get("id") or "")
        if not eid:
            continue
        out[eid] = resolve_salary_for_month(
            history_by_eid.get(eid, []),
            month=month,
            year=year,
            fallback_salary=float(emp.get("salary_monthly") or 0),
        )
    return out


def salary_display_meta(history_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Current effective period + previous salary (for Employees table)."""
    if not history_rows:
        return {}
    ordered = sorted(
        history_rows,
        key=lambda r: _period_key(int(r.get("effective_year") or 0), int(r.get("effective_month") or 0)),
        reverse=True,
    )
    current = ordered[0]
    cy = int(current.get("effective_year") or 0)
    cm = int(current.get("effective_month") or 0)
    meta: Dict[str, Any] = {
        "salary_effective_year": cy,
        "salary_effective_month": cm,
    }
    if len(ordered) > 1:
        prev = ordered[1]
        until_y, until_m = _month_before(cy, cm)
        meta["previous_salary_monthly"] = float(prev.get("salary_monthly") or 0)
        meta["previous_salary_effective_until_year"] = until_y
        meta["previous_salary_effective_until_month"] = until_m
    return meta


def enrich_employees_with_salary_meta(
    supabase: SupabaseRest,
    employees: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    emp_ids = {str(r.get("id")) for r in employees if r.get("id")}
    history_by_eid = _fetch_history_for_employees(supabase, emp_ids)
    out: List[Dict[str, Any]] = []
    for emp in employees:
        row = dict(emp)
        eid = str(emp.get("id") or "")
        meta = salary_display_meta(history_by_eid.get(eid, []))
        row.update(meta)
        out.append(row)
    return out


def _upsert_history_row(
    supabase: SupabaseRest,
    *,
    employee_id: str,
    salary_monthly: float,
    effective_year: int,
    effective_month: int,
) -> None:
    supabase.upsert_many(
        table="employee_salary_history",
        rows=[
            {
                "employee_id": employee_id,
                "salary_monthly": round(float(salary_monthly), 2),
                "effective_year": int(effective_year),
                "effective_month": int(effective_month),
            }
        ],
        on_conflict="employee_id,effective_year,effective_month",
    )


def record_initial_salary(
    supabase: SupabaseRest,
    *,
    employee_id: str,
    salary_monthly: float,
    effective_year: int,
    effective_month: int,
) -> None:
    if salary_monthly is None or float(salary_monthly) < 0:
        return
    _upsert_history_row(
        supabase,
        employee_id=employee_id,
        salary_monthly=float(salary_monthly),
        effective_year=effective_year,
        effective_month=effective_month,
    )


def record_salary_change(
    supabase: SupabaseRest,
    *,
    employee_id: str,
    new_salary: float,
    effective_year: int,
    effective_month: int,
    previous_salary: Optional[float],
) -> None:
    history_by_eid = _fetch_history_for_employees(supabase, {employee_id})
    history = history_by_eid.get(employee_id, [])

    if not history and previous_salary is not None and float(previous_salary) >= 0:
        if float(previous_salary) != float(new_salary):
            _upsert_history_row(
                supabase,
                employee_id=employee_id,
                salary_monthly=float(previous_salary),
                effective_year=_BOOTSTRAP_YEAR,
                effective_month=_BOOTSTRAP_MONTH,
            )

    _upsert_history_row(
        supabase,
        employee_id=employee_id,
        salary_monthly=float(new_salary),
        effective_year=effective_year,
        effective_month=effective_month,
    )
