from __future__ import annotations

import logging
from typing import Any, Callable, Dict, List, Optional, Set
from urllib.parse import quote

from database.supabase_client import SupabaseRest, get_supabase_service
from services.decision_token_service import make_decision_token
from services.email_service import (
    email_delivery_mode,
    postmark_token_configured,
    render_email_template,
    send_email,
)
from services.leave_applicant_display import (
    applicant_id_mail_for_notify,
    resolve_leave_applicant_display,
    resolve_leave_applicant_mapping,
)
from services.public_frontend_url import public_base_url_for_email

logger = logging.getLogger(__name__)


def _norm_email(raw: Any) -> str:
    return str(raw or "").strip().lower()


def _planned_unique_emails(
    approval_targets: List[str],
    notifications: List[Dict[str, Any]],
    id_mail: Optional[str],
    *,
    skip_global: Set[str],
) -> int:
    seen: Set[str] = set()
    for email in approval_targets:
        if email:
            seen.add(email)
    for row in notifications or []:
        email = _norm_email(row.get("email"))
        if email and email not in skip_global:
            seen.add(email)
    if id_mail and id_mail not in seen:
        seen.add(id_mail)
    return len(seen)


def _send_approval_email(
    *,
    to_email: str,
    leave_id: str,
    applicant_name: str,
    applicant_email: str,
    from_date: str,
    to_date: str,
    reason: str,
    base: str,
    on_approval_tokens: Optional[Callable[[str, str, str], None]],
) -> bool:
    approve_token = make_decision_token(leave_id=leave_id, email=to_email, action="approve")
    reject_token = make_decision_token(leave_id=leave_id, email=to_email, action="reject")
    if on_approval_tokens:
        on_approval_tokens(to_email, approve_token, reject_token)
    approve_url = (
        f"{base}/leave/decision?leave_id={quote(leave_id, safe='')}"
        f"&token={quote(approve_token, safe='')}&action=approve"
    )
    reject_url = f"{base}/leave/reject?leave_id={quote(leave_id, safe='')}&token={quote(reject_token, safe='')}"
    html = render_email_template(
        "leave_approval_request.html",
        {
            "applicant_name": applicant_name,
            "applicant_email": applicant_email,
            "from_date": from_date,
            "to_date": to_date,
            "reason": reason,
            "approve_url": approve_url,
            "reject_url": reject_url,
            "leave_id": leave_id,
        },
    )
    return bool(
        send_email(
            to_email,
            subject=f"Leave Approval Request — {applicant_name} ({from_date} -> {to_date})",
            html=html,
            text=(
                f"Leave request for {applicant_name}: {from_date} -> {to_date}. "
                f"Approve: {approve_url} Reject: {reject_url}"
            ),
        )
    )


def notify_leave_apply_recipients(
    *,
    employee: Dict[str, Any],
    leave_id: str,
    from_date: str,
    to_date: str,
    reason: str,
    supabase: Optional[SupabaseRest] = None,
    log_context: str = "leave_approval_email",
    on_approval_tokens: Optional[Callable[[str, str, str], None]] = None,
) -> Dict[str, Any]:
    """
    Matched Leave apply from row:
      - Approval → that row's approver_email only (not global Approval list).
      - Applicant ID never receives Approval/Notification global-list mail.
    No match: global Approval + Notification lists (unchanged).
    Each address gets at most one email per leave.
    """
    summary: Dict[str, Any] = {
        "loaded_lists": False,
        "approval_list_count": 0,
        "notification_list_count": 0,
        "emails_sent_approval": 0,
        "emails_sent_notification": 0,
        "emails_sent_applicant": 0,
        "applicant_list_count": 0,
        "applicant_notify_email": None,
        "applicant_approver_email": None,
        "planned_recipient_count": 0,
        "error": None,
        "delivery_mode": email_delivery_mode(),
        "delivery_note": None,
    }
    db = supabase or get_supabase_service()
    try:
        approvals = db.select(
            table="email_lists",
            select="email,name",
            where_eq={"kind": "approval"},
            order="created_at.desc",
            limit=200,
        )
        notifications = db.select(
            table="email_lists",
            select="email,name",
            where_eq={"kind": "notification"},
            order="created_at.desc",
            limit=200,
        )
        applicants = db.select(
            table="email_lists",
            select="email,name,approver_email",
            where_eq={"kind": "applicant"},
            order="created_at.desc",
            limit=200,
        )
        summary["loaded_lists"] = True
        summary["approval_list_count"] = len(approvals or [])
        summary["notification_list_count"] = len(notifications or [])
        summary["applicant_list_count"] = len(applicants or [])
    except Exception as exc:
        summary["error"] = f"email_lists_query_failed: {exc}"
        logger.error("Leave notify: could not read email_lists: %s", exc, exc_info=True)
        return summary

    mapping = resolve_leave_applicant_mapping(employee, supabase=db)
    applicant_email, applicant_name = resolve_leave_applicant_display(employee, supabase=db)
    id_mail = applicant_id_mail_for_notify(employee, supabase=db)
    summary["applicant_notify_email"] = id_mail

    skip_global: Set[str] = set()
    if id_mail:
        skip_global.add(id_mail)

    approver_mail = _norm_email((mapping or {}).get("approver_email"))
    use_mapped_approver = bool(mapping and approver_mail)
    if use_mapped_approver:
        summary["applicant_approver_email"] = approver_mail
        skip_global.add(approver_mail)
        approval_targets = [approver_mail]
    else:
        approval_targets = [
            _norm_email(row.get("email"))
            for row in (approvals or [])
            if _norm_email(row.get("email")) and _norm_email(row.get("email")) not in skip_global
        ]

    already_notified: Set[str] = set()
    summary["planned_recipient_count"] = _planned_unique_emails(
        approval_targets,
        notifications or [],
        id_mail,
        skip_global=skip_global,
    )
    base = public_base_url_for_email(log_context=log_context)

    try:
        for to_email in approval_targets:
            if not to_email or to_email in already_notified:
                continue
            if _send_approval_email(
                to_email=to_email,
                leave_id=leave_id,
                applicant_name=applicant_name,
                applicant_email=applicant_email,
                from_date=from_date,
                to_date=to_date,
                reason=reason,
                base=base,
                on_approval_tokens=on_approval_tokens,
            ):
                summary["emails_sent_approval"] += 1
                already_notified.add(to_email)

        for row in notifications or []:
            to_email = _norm_email(row.get("email"))
            if not to_email or to_email in already_notified or to_email in skip_global:
                continue
            html = render_email_template(
                "leave_notification.html",
                {
                    "applicant_name": applicant_name,
                    "applicant_email": applicant_email,
                    "from_date": from_date,
                    "to_date": to_date,
                    "reason": reason,
                },
            )
            if send_email(
                to_email,
                subject=f"Leave Applied — {applicant_name} ({from_date} -> {to_date})",
                html=html,
                text=f"FYI: {applicant_name} applied leave for {from_date} -> {to_date}.",
            ):
                summary["emails_sent_notification"] += 1
                already_notified.add(to_email)

        if id_mail and id_mail not in already_notified:
            html = render_email_template(
                "leave_notification.html",
                {
                    "applicant_name": applicant_name,
                    "applicant_email": applicant_email,
                    "from_date": from_date,
                    "to_date": to_date,
                    "reason": reason,
                },
            )
            if send_email(
                id_mail,
                subject=f"Leave Applied — {applicant_name} ({from_date} -> {to_date})",
                html=html,
                text=f"FYI: {applicant_name} applied leave for {from_date} -> {to_date}.",
            ):
                summary["emails_sent_applicant"] += 1
                already_notified.add(id_mail)

        sent_total = (
            summary["emails_sent_approval"]
            + summary["emails_sent_notification"]
            + summary["emails_sent_applicant"]
        )
        if (
            summary["planned_recipient_count"] > 0
            and sent_total == 0
            and email_delivery_mode() == "postmark"
            and not postmark_token_configured()
        ):
            summary["delivery_note"] = (
                "No emails were delivered: Postmark SMTP credentials missing on the API server. "
                "Set POSTMARK_SMTP_USERNAME, POSTMARK_SMTP_TOKEN, POSTMARK_SMTP_HOST, POSTMARK_SMTP_PORT, "
                "and SMTP_FROM_EMAIL where FastAPI runs (e.g. Render), redeploy, or set EMAIL_MODE=log."
            )
    except Exception as exc:
        summary["error"] = f"send_failed: {exc}"
        logger.error(
            "Leave saved but notification email failed — check POSTMARK_SMTP_* and SMTP_FROM_EMAIL: %s",
            exc,
            exc_info=True,
        )

    return summary
