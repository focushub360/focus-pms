"""Transactional email service supporting Resend API and Emergent integration proxy.
Preserves strict safety guardrails against phishing and malicious links.
"""
from __future__ import annotations

import ipaddress
import logging
import os
import re
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

logger = logging.getLogger("focus-pms.email")

EMAIL_BASE_URL = os.environ.get("INTEGRATION_PROXY_URL", "https://integrations.emergentagent.com").rstrip("/")
EMERGENT_EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")

EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "Focus Engineering PMS")
EMAIL_FROM_ADDRESS = os.environ.get("EMAIL_FROM_ADDRESS", "onboarding@resend.dev")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
APP_PUBLIC_URL = os.environ.get("APP_PUBLIC_URL", "http://localhost:3000").rstrip("/")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = (
    "reply with your password", "reply with the code", "send your password", "cvv",
    "send us your password", "enter your password below", "confirm your card number",
    "your full card number", "seed phrase", "recovery phrase", "verify your card",
    "social security number", "confirm your bank details",
)
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    if host in ("localhost", "127.0.0.1"):
        return True
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not (low.startswith("https://") or low.startswith("http://localhost") or low.startswith("http://127.0.0.1")):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened/numeric/credential URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} ≠ real {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str, reply_to: str | None = None) -> str | None:
    _assert_safe_email(subject, html)

    # 1. Direct Resend API
    if RESEND_API_KEY:
        resend_payload = {
            "from": f"{EMAIL_FROM_NAME} <{EMAIL_FROM_ADDRESS}>",
            "to": [to],
            "subject": subject,
            "html": html,
        }
        if reply_to or EMAIL_REPLY_TO:
            resend_payload["reply_to"] = reply_to or EMAIL_REPLY_TO
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {RESEND_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json=resend_payload,
                )
            resp.raise_for_status()
            res_id = resp.json().get("id")
            logger.info("Email sent via Resend to %s (id: %s)", to, res_id)
            return res_id
        except Exception as e:
            logger.error("Direct Resend email send failed: %s", e)
            raise HTTPException(status_code=502, detail="Failed to send email via Resend")

    # 2. Emergent integration proxy
    if EMERGENT_EMAIL_KEY:
        proxy_payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
        if reply_to or EMAIL_REPLY_TO:
            proxy_payload["contact_email"] = reply_to or EMAIL_REPLY_TO
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{EMAIL_BASE_URL}/api/v1/email/send",
                    headers={"X-Email-Key": EMERGENT_EMAIL_KEY},
                    json=proxy_payload,
                )
            resp.raise_for_status()
            res_id = resp.json().get("id")
            logger.info("Email sent via Emergent proxy to %s (id: %s)", to, res_id)
            return res_id
        except httpx.HTTPStatusError as e:
            try:
                code = e.response.json().get("code", "")
            except ValueError:
                code = ""
            if code in ("insufficient_credits", "integration_disabled", "daily_limit_reached"):
                logger.warning("Email paused: %s (%s)", code, e.response.status_code)
                raise HTTPException(status_code=503, detail="Email is temporarily unavailable")
            logger.error("Email send failed: %s %s", e.response.status_code, e.response.text)
            raise HTTPException(status_code=502, detail="Failed to send email")
        except Exception as e:
            logger.error("Email send error: %s", e)
            raise HTTPException(status_code=500, detail="Failed to send email")

    # 3. Fallback when no email key is configured (dev/demo mode)
    logger.warning("No email provider configured (set RESEND_API_KEY). Mock email logged for %s: %s", to, subject)
    return "mock-email-id-development"


def _wrap(title: str, inner_html: str) -> str:
    return (
        f'<table role="presentation" width="100%" style="background:#F8F9FA;padding:24px 0;">'
        f'<tr><td align="center">'
        f'<table role="presentation" width="600" style="background:#FFFFFF;border:1px solid #E2E8F0;'
        f'border-radius:8px;overflow:hidden;font-family:Arial,sans-serif;color:#0F172A;">'
        f'<tr><td style="background:#262262;padding:20px 24px;color:#FFFFFF;font-size:16px;'
        f'font-weight:bold;letter-spacing:0.3px;">Focus Engineering · PMS</td></tr>'
        f'<tr><td style="padding:28px 28px 8px 28px;font-size:20px;font-weight:bold;color:#262262;">{escape(title)}</td></tr>'
        f'<tr><td style="padding:0 28px 24px 28px;font-size:14px;line-height:1.6;color:#334155;">'
        f'{inner_html}'
        f'<p style="font-size:12px;color:#64748B;margin-top:28px;border-top:1px solid #E2E8F0;padding-top:12px;">'
        f'Sent by Focus Engineering PMS. We will never ask you for your password or OTP by email.</p>'
        f'</td></tr></table></td></tr></table>'
    )


async def send_invite_email(*, to: str, name: str, token: str) -> str | None:
    base_url = APP_PUBLIC_URL or "http://localhost:3000"
    link = f"{base_url}/accept-invite/{token}"
    inner = (
        f'<p>Hi {escape(name)},</p>'
        f'<p>You have been invited to join <strong>Focus Engineering PMS</strong>, the Sales &amp; Marketing Performance Management System for Focus Engineering.</p>'
        f'<p>Click the button below to set your password and activate your account. This link expires in 48 hours.</p>'
        f'<p style="margin:24px 0;">'
        f'<a href="{link}" style="background:#264494;color:#FFFFFF;text-decoration:none;'
        f'padding:12px 24px;border-radius:6px;font-weight:bold;display:inline-block;">Activate my account</a>'
        f'</p>'
        f'<p style="font-size:12px;color:#64748B;">Direct link: <a href="{link}">{link}</a></p>'
    )
    logger.info("Account invite token generated for %s: %s", to, link)
    return await send_email(to=to, subject="Activate your Focus PMS account", html=_wrap("Welcome to Focus PMS", inner))


async def send_password_reset_email(*, to: str, name: str, token: str) -> str | None:
    base_url = APP_PUBLIC_URL or "http://localhost:3000"
    link = f"{base_url}/reset-password/{token}"
    inner = (
        f'<p>Hi {escape(name)},</p>'
        f'<p>We received a request to reset your Focus PMS password. Click the button below to set a new one. This link expires in 1 hour.</p>'
        f'<p style="margin:24px 0;">'
        f'<a href="{link}" style="background:#264494;color:#FFFFFF;text-decoration:none;'
        f'padding:12px 24px;border-radius:6px;font-weight:bold;display:inline-block;">Reset my password</a>'
        f'</p>'
        f'<p style="font-size:12px;color:#64748B;">Direct link: <a href="{link}">{link}</a></p>'
        f'<p style="font-size:12px;color:#64748B;">If you did not request this, you can ignore this email.</p>'
    )
    logger.info("Password reset token generated for %s: %s", to, link)
    return await send_email(to=to, subject="Reset your Focus PMS password", html=_wrap("Password reset", inner))
