from services.decision_token_service import make_decision_token, verify_decision_token


def test_decision_token_roundtrip(monkeypatch):
    monkeypatch.setenv("DECISION_TOKEN_SECRET", "test-secret")
    token = make_decision_token(leave_id="leave-1", email="a@b.com", action="approve", expires_in_seconds=60)
    payload = verify_decision_token(token)
    assert payload["leave_id"] == "leave-1"
    assert payload["email"] == "a@b.com"
    assert payload["action"] == "approve"
    assert str(payload.get("jti") or "").strip()


def test_decision_token_expired(monkeypatch):
    monkeypatch.setenv("DECISION_TOKEN_SECRET", "test-secret")
    token = make_decision_token(leave_id="leave-1", email="a@b.com", action="reject", expires_in_seconds=-10)
    try:
        verify_decision_token(token)
    except ValueError as exc:
        assert "expired" in str(exc).lower()
    else:
        raise AssertionError("expected ValueError")
