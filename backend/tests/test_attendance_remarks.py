from __future__ import annotations

from datetime import date

import pytest
from fastapi import HTTPException

from services import attendance_management_service as svc


def test_times_changed_detects_in_out_updates():
    existing = {"check_in": "09:00:00", "check_out": "18:00:00"}
    assert svc._times_changed(existing, "09:00", "18:00") is False
    assert svc._times_changed(existing, "09:15", "18:00") is True
    assert svc._times_changed(None, "09:00", None) is True


def test_update_attendance_requires_remarks_for_manual_times(monkeypatch):
    class FakeSupabase:
        def select(self, **kwargs):
            return []

        def upsert_many(self, **kwargs):
            return None

        def insert_many(self, **kwargs):
            return []

    monkeypatch.setattr(svc, "ensure_month", lambda *a, **k: ([], {}))
    monkeypatch.setattr(svc, "_holiday_labels_for_month", lambda *a, **k: {})
    monkeypatch.setattr(svc, "_employee_email_lower", lambda *a, **k: None)

    with pytest.raises(HTTPException) as exc:
        svc.update_attendance(
            {
                "employee_id": "11111111-1111-1111-1111-111111111111",
                "date": date(2026, 6, 6),
                "in_time": "09:30",
                "out_time": "18:00",
            },
            FakeSupabase(),
            actor_role="master_admin",
        )
    assert exc.value.status_code == 400
    assert "Remarks are required" in str(exc.value.detail)


def test_update_attendance_blocks_non_master_time_changes(monkeypatch):
    class FakeSupabase:
        def select(self, **kwargs):
            return [{"check_in": "09:00:00", "check_out": "18:00:00", "remarks": "old"}]

        def upsert_many(self, **kwargs):
            return None

    monkeypatch.setattr(svc, "ensure_month", lambda *a, **k: ([], {}))
    monkeypatch.setattr(svc, "_holiday_labels_for_month", lambda *a, **k: {})
    monkeypatch.setattr(svc, "_employee_email_lower", lambda *a, **k: None)

    with pytest.raises(HTTPException) as exc:
        svc.update_attendance(
            {
                "employee_id": "11111111-1111-1111-1111-111111111111",
                "date": date(2026, 6, 6),
                "in_time": "09:45",
                "out_time": "18:00",
            },
            FakeSupabase(),
            actor_role="admin",
        )
    assert exc.value.status_code == 403
