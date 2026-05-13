import pytest

from services import public_frontend_url as pfu


def test_prefers_email_frontend_url(monkeypatch):
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.setenv("EMAIL_FRONTEND_URL", "https://email.example.com")
    monkeypatch.setenv("FRONTEND_URL", "https://wrong.example.com")
    assert pfu.public_base_url_for_email() == "https://email.example.com"


def test_managed_host_fallback_when_unset(monkeypatch):
    monkeypatch.delenv("FRONTEND_URL", raising=False)
    monkeypatch.delenv("EMAIL_FRONTEND_URL", raising=False)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.delenv("FALLBACK_EMAIL_FRONTEND_URL", raising=False)
    url = pfu.public_base_url_for_email()
    assert url.startswith("https://")
    assert "localhost" not in url.lower()


def test_managed_host_respects_fallback_env(monkeypatch):
    monkeypatch.delenv("FRONTEND_URL", raising=False)
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setenv("FALLBACK_EMAIL_FRONTEND_URL", "https://custom.app")
    assert pfu.public_base_url_for_email() == "https://custom.app"


def test_localhost_when_not_managed_and_no_env(monkeypatch):
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("FRONTEND_URL", raising=False)
    monkeypatch.delenv("EMAIL_FRONTEND_URL", raising=False)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    assert pfu.public_base_url_for_email() == "http://localhost:3000"
