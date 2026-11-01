from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import smtplib
import requests

from app.core.config import settings


def _send_email_resend(to_email: str, subject: str, html_content: str) -> bool:
    """Wysyła e-mail za pomocą Resend REST API (HTTPS). Działa niezawodnie w chmurach typu Render."""
    if not settings.RESEND_API_KEY:
        return False

    sender = settings.EMAIL_FROM or "SettleApp <onboarding@resend.dev>"
    if "@" not in sender:
        sender = "SettleApp <onboarding@resend.dev>"

    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {settings.RESEND_API_KEY.strip()}",
        "Content-Type": "application/json",
    }
    payload = {
        "from": sender,
        "to": [to_email],
        "subject": subject,
        "html": html_content,
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        if response.status_code in (200, 201):
            data = response.json()
            print(f"[RESEND SUCCESS] Mail wysłany do {to_email} ({subject}), id: {data.get('id')}")
            return True
        else:
            print(f"[RESEND ERROR] Błąd Resend API ({response.status_code}): {response.text}")
            return False
    except Exception as e:
        print(f"[RESEND ERROR] Błąd połączenia z Resend API: {e}")
        return False


def _send_email_smtp(to_email: str, subject: str, html_content: str) -> bool:
    """Wysyła e-mail za pomocą standardowego protokołu SMTP (np. Gmail, własna poczta)."""
    if not settings.SMTP_HOST or not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        print("[EMAIL WARNING] Brak konfiguracji SMTP (SMTP_HOST, SMTP_USER, SMTP_PASSWORD) w .env!")
        return False

    sender_email = settings.EMAIL_FROM or settings.SMTP_USER

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"SettleApp <{sender_email}>"
    msg["To"] = to_email

    msg.attach(MIMEText(html_content, "html", "utf-8"))

    password = settings.SMTP_PASSWORD.replace(" ", "").strip()

    try:
        if settings.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                server.login(settings.SMTP_USER, password)
                server.sendmail(sender_email, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                if settings.SMTP_USE_TLS:
                    server.starttls()
                server.login(settings.SMTP_USER, password)
                server.sendmail(sender_email, [to_email], msg.as_string())

        print(f"[EMAIL SUCCESS] Mail wysłany pomyślnie do {to_email} ({subject})")
        return True
    except Exception as e:
        print(f"[EMAIL ERROR] Błąd podczas wysyłki maila przez SMTP: {e}")
        return False


def _send_email_brevo(to_email: str, subject: str, html_content: str) -> bool:
    """Wysyła e-mail za pomocą Brevo REST API (HTTPS). Działa na Renderze i pozwala wysyłać do każdego odbiorcy za darmo (300 maili/dzień)."""
    if not getattr(settings, "BREVO_API_KEY", ""):
        return False

    sender_email = settings.EMAIL_FROM or settings.SMTP_USER or "settle.app26@gmail.com"
    sender_name = "SettleApp"

    url = "https://api.brevo.com/v3/smtp/email"
    headers = {
        "api-key": settings.BREVO_API_KEY.strip(),
        "accept": "application/json",
        "content-type": "application/json",
    }
    payload = {
        "sender": {
            "name": sender_name,
            "email": sender_email,
        },
        "to": [
            {
                "email": to_email,
            }
        ],
        "subject": subject,
        "htmlContent": html_content,
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        if response.status_code in (200, 201):
            data = response.json()
            print(f"[BREVO SUCCESS] Mail wysłany do {to_email} ({subject}), id: {data.get('messageId')}")
            return True
        else:
            print(f"[BREVO ERROR] Błąd Brevo API ({response.status_code}): {response.text}")
            return False
    except Exception as e:
        print(f"[BREVO ERROR] Wyjątek podczas wysyłki przez Brevo API: {e}")
        return False


def _send_email(to_email: str, subject: str, html_content: str) -> bool:
    """
    Główna funkcja wysyłki e-maili:
    1. Próbuje najpierw przez Brevo REST API (HTTPS port 443 - 300 darmowych maili dziennie do każdego).
    2. Jeśli nie ma klucza Brevo, próbuje przez Resend REST API.
    3. Jako fallback używa standardowego SMTP (np. lokalnie z Gmailem).
    """
    if getattr(settings, "BREVO_API_KEY", ""):
        if _send_email_brevo(to_email, subject, html_content):
            return True
        print("[EMAIL INFO] Próba wysyłki przez Brevo nie powiodła się, sprawdzam inne metody...")

    if getattr(settings, "RESEND_API_KEY", ""):
        if _send_email_resend(to_email, subject, html_content):
            return True
        print("[EMAIL INFO] Próba wysyłki przez Resend nie powiodła się, sprawdzam SMTP...")

    if settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD:
        return _send_email_smtp(to_email, subject, html_content)

    print("[EMAIL WARNING] Brak skonfigurowanego klucza Brevo/Resend ani pełnych danych SMTP!")
    return False


def send_verification_email(to_email: str, token: str) -> None:
    base_url = getattr(settings, "BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
    verify_url = f"{base_url}/api/auth/verify?token={token}"

    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: #1e293b; padding: 24px; border-radius: 8px;">
          <h2 style="color: #38bdf8; margin-top: 0;">Weryfikacja konta SettleApp</h2>
          <p style="color: #cbd5e1;">Kliknij poniższy przycisk, aby potwierdzić swój adres e-mail:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="{verify_url}" style="background-color: #38bdf8; color: #0f172a; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
              Aktywuj konto
            </a>
          </div>
          <p style="color: #94a3b8; font-size: 12px;">Link jest ważny przez 24 godziny. Jeśli nie zakładałeś konta, zignoruj tę wiadomość.</p>
        </div>
      </body>
    </html>
    """

    _send_email(to_email, "Zweryfikuj konto w SettleApp", html_content)


def send_transfer_notification_email(recipient_email: str, sender_name: str, amount_cents: int) -> None:
    amount_pln = f"{amount_cents / 100:.2f} PLN"

    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: #1e293b; padding: 24px; border-radius: 8px; border: 1px solid #334155;">
          <h2 style="color: #38bdf8; margin-top: 0;">Nowa deklaracja spłaty</h2>
          <p style="color: #cbd5e1;"><strong style="color: #f8fafc;">{sender_name}</strong> zadeklarował wykonanie przelewu na kwotę <strong style="color: #38bdf8;">{amount_pln}</strong>.</p>
          <p style="color: #94a3b8; font-size: 14px; line-height: 1.5;">Sprawdź swoje konto bankowe, a następnie wejdź do aplikacji SettleApp, aby zatwierdzić lub odrzucić wpłatę.</p>
        </div>
      </body>
    </html>
    """

    _send_email(recipient_email, f"SettleApp: {sender_name} zadeklarował spłatę {amount_pln}", html_content)


def send_transfer_rejected_email(
    recipient_email: str,
    sender_name: str,
    receiver_name: str,
    amount_cents: int,
) -> None:
    amount_pln = f"{amount_cents / 100:.2f} PLN"

    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: #1e293b; padding: 24px; border-radius: 8px; border: 1px solid #ef4444;">
          <h2 style="color: #ef4444; margin-top: 0;">Deklaracja spłaty odrzucona</h2>
          <p style="color: #cbd5e1;">Cześć <strong style="color: #f8fafc;">{sender_name}</strong>,</p>
          <p style="color: #cbd5e1;"><strong style="color: #f8fafc;">{receiver_name}</strong> odrzucił Twoją deklarację przelewu na kwotę <strong style="color: #ef4444;">{amount_pln}</strong>.</p>
          <div style="background-color: #2a1215; border-left: 4px solid #ef4444; padding: 12px; margin: 20px 0; border-radius: 4px;">
            <p style="color: #fca5a5; margin: 0; font-size: 14px;">Twój dług w grupie został automatycznie przywrócony.</p>
          </div>
          <p style="color: #94a3b8; font-size: 14px; line-height: 1.5;">Upewnij się, że przelew został rzeczywiście wysłany lub skontaktuj się z odbiorcą w celu wyjaśnienia.</p>
        </div>
      </body>
    </html>
    """

    _send_email(recipient_email, f"SettleApp: {receiver_name} odrzucił deklarację spłaty {amount_pln}", html_content)


def send_monthly_settlement_email(
    recipient_email: str,
    recipient_name: str,
    group_name: str,
    settlements: list[dict],
) -> None:
    rows_html = "".join(
        f"""
        <li style="margin-bottom: 8px;">
          Przelej <strong>{s['amount_pln']}</strong> do <strong>{s['to_user_name']}</strong>
          {f'(BLIK: {s["to_user_phone"]})' if s.get('to_user_phone') else ''}
        </li>
        """
        for s in settlements
    )

    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 20px;">
        <div style="max-width: 520px; margin: 0 auto; background: #1e293b; padding: 24px; border-radius: 8px; border: 1px solid #334155;">
          <h2 style="color: #38bdf8; margin-top: 0;">Miesięczne rozliczenie: {group_name}</h2>
          <p style="color: #cbd5e1;">Cześć {recipient_name}, zakończył się miesiąc i czas wyrównać salda w grupie.</p>
          <p style="color: #f8fafc; font-weight: bold;">Twoje sugerowane spłaty:</p>
          <ul style="color: #cbd5e1; padding-left: 20px;">
            {rows_html}
          </ul>
          <p style="color: #94a3b8; font-size: 13px; margin-top: 24px;">
            Po wykonaniu przelewów zgłoś je w aplikacji SettleApp, aby zaktualizować saldo grupy.
          </p>
        </div>
      </body>
    </html>
    """

    _send_email(recipient_email, f"SettleApp: Miesięczne rozliczenie grupy {group_name}", html_content)


def send_monthly_creditor_settlement_email(
    recipient_email: str,
    recipient_name: str,
    group_name: str,
    credits: list[dict],
) -> None:
    total_cents = sum(c.get("amount_cents", 0) for c in credits)
    total_pln = f"{total_cents / 100:.2f} PLN"

    rows_html = "".join(
        f"""
        <li style="margin-bottom: 8px;">
          <strong>{c['from_user_name']}</strong> powinien przelać Ci <strong>{c['amount_pln']}</strong>
        </li>
        """
        for c in credits
    )

    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 20px;">
        <div style="max-width: 520px; margin: 0 auto; background: #1e293b; padding: 24px; border-radius: 8px; border: 1px solid #10b981;">
          <h2 style="color: #10b981; margin-top: 0;">Miesięczne rozliczenie: {group_name}</h2>
          <p style="color: #cbd5e1;">Cześć {recipient_name}, zakończył się miesiąc i podsumowaliśmy salda w grupie.</p>
          <div style="background-color: #064e3b; border-left: 4px solid #10b981; padding: 12px; margin: 16px 0; border-radius: 4px;">
            <p style="color: #a7f3d0; margin: 0; font-size: 15px;">
              Jesteś na plusie! Członkowie grupy powinni zwrócić Ci łącznie: <strong>{total_pln}</strong>
            </p>
          </div>
          <p style="color: #f8fafc; font-weight: bold;">Oczekiwane spłaty:</p>
          <ul style="color: #cbd5e1; padding-left: 20px;">
            {rows_html}
          </ul>
          <p style="color: #94a3b8; font-size: 13px; margin-top: 24px;">
            Gdy otrzymasz przelew na konto lub BLIK, nadawca zgłosi deklarację w aplikacji SettleApp – pamiętaj o jej zatwierdzeniu.
          </p>
        </div>
      </body>
    </html>
    """

    _send_email(recipient_email, f"SettleApp: Podsumowanie miesiąca grupy {group_name} - należności ({total_pln})", html_content)
