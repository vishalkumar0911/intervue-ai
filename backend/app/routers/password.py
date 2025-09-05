# backend/app/routers/password.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, EmailStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from datetime import datetime, timedelta
from urllib.parse import urljoin
import ssl, smtplib, jwt, requests
from email.message import EmailMessage
import os

router = APIRouter(prefix="/auth", tags=["auth"])

# ---------- Settings (read from .env here) -----------------------------------
class PwdSettings(BaseSettings):
    # tokens / links
    APP_JWT_SECRET: str = "dev-secret"
    RESET_TOKEN_EXPIRES_MIN: int = 30
    FRONTEND_URL: str = "http://localhost:3000"

    # mail (either Resend OR SMTP — if both present we use Resend)
    RESEND_API_KEY: str | None = None
    EMAIL_FROM: str | None = None

    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASS: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

CFG = PwdSettings()

# Tiny debug (no secrets)
print(
    "[AUTH/MAIL] provider=" +
    ("resend" if CFG.RESEND_API_KEY else "smtp" if CFG.SMTP_HOST else "dev") +
    f" from={CFG.EMAIL_FROM or '-'} host={CFG.SMTP_HOST or '-'}"
)

# ---------- Mail helpers ------------------------------------------------------
def _send_via_resend(to: str, subject: str, html: str):
    if not (CFG.RESEND_API_KEY and CFG.EMAIL_FROM):
        raise RuntimeError("Resend not configured")
    r = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {CFG.RESEND_API_KEY}",
                 "Content-Type": "application/json"},
        json={"from": CFG.EMAIL_FROM, "to": [to], "subject": subject, "html": html},
        timeout=15,
    )
    r.raise_for_status()

def _send_via_smtp(to: str, subject: str, html: str):
    if not (CFG.SMTP_HOST and CFG.SMTP_USER and CFG.SMTP_PASS and CFG.EMAIL_FROM):
        raise RuntimeError("SMTP not configured")
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = CFG.EMAIL_FROM
    msg["To"] = to
    msg.set_content(f"{subject}\n\nThis link is valid for {CFG.RESET_TOKEN_EXPIRES_MIN} minutes.")
    msg.add_alternative(html, subtype="html")

    ctx = ssl.create_default_context()
    with smtplib.SMTP(CFG.SMTP_HOST, CFG.SMTP_PORT, timeout=20) as s:
        s.starttls(context=ctx)
        s.login(CFG.SMTP_USER, CFG.SMTP_PASS)
        s.send_message(msg)

def send_email(to: str, subject: str, html: str):
    if CFG.RESEND_API_KEY:
        _send_via_resend(to, subject, html)
        return
    if CFG.SMTP_HOST:
        _send_via_smtp(to, subject, html)
        return
    # Dev fallback: print
    print("\n[DEV EMAIL]\nTO:", to, "\nSUBJECT:", subject, "\n\n", html, "\n")

# ---------- Token helpers -----------------------------------------------------
def make_token(email: str) -> str:
    exp = datetime.utcnow() + timedelta(minutes=CFG.RESET_TOKEN_EXPIRES_MIN)
    return jwt.encode({"sub": email.lower(), "exp": exp}, CFG.APP_JWT_SECRET, algorithm="HS256")

def verify_token(token: str) -> str:
    try:
        payload = jwt.decode(token, CFG.APP_JWT_SECRET, algorithms=["HS256"])
        return payload["sub"]
    except Exception:
        raise HTTPException(400, "Invalid or expired token")

# ---------- Schemas -----------------------------------------------------------
class ForgotIn(BaseModel):
    email: EmailStr

class ResetIn(BaseModel):
    token: str
    new_password: str

# ---------- Endpoints ---------------------------------------------------------
@router.post("/forgot")
def forgot_password(body: ForgotIn, tasks: BackgroundTasks):
    token = make_token(body.email)
    reset_url = urljoin(CFG.FRONTEND_URL.rstrip("/") + "/", f"reset-password/{token}")

    html = f"""<!doctype html>
<html>
  <body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#0f172a;background:#ffffff">
    <div style="max-width:560px;margin:24px auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
      <h2 style="margin:0 0 12px 0;color:#111827">Reset your Intervue.AI password</h2>
      <p style="margin:0 0 12px 0">Click the button below to set a new password. This link is valid for {CFG.RESET_TOKEN_EXPIRES_MIN} minutes.</p>
      <p style="margin:16px 0">
        <a href="{reset_url}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#6366f1;color:#ffffff;text-decoration:none;font-weight:600">Set new password</a>
      </p>
      <p style="margin:24px 0 0 0;font-size:14px;color:#475569">If the button doesn't work, copy and paste this URL into your browser:</p>
      <p style="word-break:break-all;font-size:13px;color:#334155">{reset_url}</p>
      <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0" />
      <p style="margin:0;font-size:12px;color:#64748b">If you didn’t request this, you can safely ignore this email.</p>
    </div>
  </body>
</html>"""

    # Offload send to background so the request returns immediately
    tasks.add_task(send_email, body.email, "Reset your Intervue.AI password", html)
    return {"ok": True}

@router.post("/reset")
def reset_password(body: ResetIn):
    email = verify_token(body.token)
    # here you'd persist new password to DB if you had one
    return {"ok": True, "email": email}
