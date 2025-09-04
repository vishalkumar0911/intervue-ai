from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
import os, jwt, requests, ssl, smtplib
from email.message import EmailMessage

router = APIRouter(prefix="/auth", tags=["auth"])

SECRET       = os.getenv("APP_JWT_SECRET", "dev-secret")
EXP_MIN      = int(os.getenv("RESET_TOKEN_EXPIRES_MIN", "30"))
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# --- Mail helpers -------------------------------------------------------------
def send_via_resend(to: str, subject: str, html: str):
    key = os.getenv("RESEND_API_KEY")
    if not key:
        raise RuntimeError("RESEND_API_KEY not set")
    r = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"from": os.getenv("EMAIL_FROM"), "to": [to], "subject": subject, "html": html},
        timeout=10,
    )
    r.raise_for_status()

def send_via_smtp(to: str, subject: str, html: str):
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = os.getenv("EMAIL_FROM")
    msg["To"] = to
    msg.set_content("Use an HTML-capable email client.")
    msg.add_alternative(html, subtype="html")
    ctx = ssl.create_default_context()
    with smtplib.SMTP(os.getenv("SMTP_HOST"), int(os.getenv("SMTP_PORT"))) as s:
        s.starttls(context=ctx)
        s.login(os.getenv("SMTP_USER"), os.getenv("SMTP_PASS"))
        s.send_message(msg)

def send_email(to: str, subject: str, html: str):
    if os.getenv("RESEND_API_KEY"):
        send_via_resend(to, subject, html)
    elif os.getenv("SMTP_HOST"):
        send_via_smtp(to, subject, html)
    else:
        print(f"\n[DEV EMAIL] to={to}\nsubj={subject}\n{html}\n")

# --- Token helpers ------------------------------------------------------------
def make_token(email: str):
    exp = datetime.utcnow() + timedelta(minutes=EXP_MIN)
    return jwt.encode({"sub": email.lower(), "exp": exp}, SECRET, algorithm="HS256")

def verify_token(token: str) -> str:
    try:
        payload = jwt.decode(token, SECRET, algorithms=["HS256"])
        return payload["sub"]
    except Exception:
        raise HTTPException(400, "Invalid or expired token")

# --- Schemas ------------------------------------------------------------------
class ForgotIn(BaseModel):
    email: EmailStr

class ResetIn(BaseModel):
    token: str
    new_password: str

# --- Endpoints ----------------------------------------------------------------
@router.post("/forgot")
def forgot_password(body: ForgotIn):
    token = make_token(body.email)
    reset_url = f"{FRONTEND_URL}/reset-password/{token}"
    send_email(
        to=body.email,
        subject="Reset your Intervue.AI password",
        html=f"""
          <p>Click the link below to reset your password (valid {EXP_MIN} minutes):</p>
          <p><a href="{reset_url}">{reset_url}</a></p>
        """,
    )
    return {"ok": True}

@router.post("/reset")
def reset_password(body: ResetIn):
    email = verify_token(body.token)
    return {"ok": True, "email": email}
