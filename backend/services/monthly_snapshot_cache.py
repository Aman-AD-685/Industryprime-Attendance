"""
In-process cache for ``public.monthly_attendance`` (one row per employee-month, ~15 KB each).

Leave and Payroll merge these snapshots under live ``public.attendance`` rows for every
request; fetching a whole year is ~0.5 MB and the slowest query in the app. The backend is
the only writer (``store_month_snapshot``), so it invalidates the year it just wrote and a
short TTL covers anything else.
"""

from __future__ import annotations

import threading
import time
from typing import Any, Dict, List, Tuple

from database.supabase_client import SupabaseRest

_TTL_SECONDS = 300.0
_cache: Dict[int, Tuple[float, List[Dict[str, Any]]]] = {}
_lock = threading.Lock()


def load_year_snapshots(supabase: SupabaseRest, year: int) -> List[Dict[str, Any]]:
    """All snapshot rows (employee_id, month, stored_data) for ``year``; [] on any error."""
    now = time.monotonic()
    with _lock:
        hit = _cache.get(year)
    if hit and hit[0] > now:
        return hit[1]
    try:
        rows = supabase.select(
            table="monthly_attendance",
            select="employee_id,month,stored_data",
            where_eq={"year": year},
            limit=5000,
        ) or []
    except Exception:
        return hit[1] if hit else []
    with _lock:
        _cache[year] = (now + _TTL_SECONDS, rows)
    return rows


def invalidate_year(year: int) -> None:
    with _lock:
        _cache.pop(int(year), None)

