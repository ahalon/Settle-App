from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel, Field
import requests
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_email_verification_token,
    get_password_hash,
    verify_email_token,
    verify_password,
)
from app.models.base import User
from app.schemas import LoginPayload, RegisterPayload, TokenResponse
from app.services.email_service import send_verification_email

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


class PushTokenPayload(BaseModel):
    token: str = Field(..., min_length=10, description="Expo push token użytkownika")


def send_expo_push(token: str, title: str, body: str, data: dict | None = None) -> None:
    """Wysyła powiadomienie push przez publiczne API Expo."""
    if not token:
        print("[Push] Pominięto wysyłkę push - brak tokena.")
        return

    token_clean = token.strip()
    if not (token_clean.startswith("ExponentPushToken") or token_clean.startswith("ExpoPushToken")):
        print(f"[Push] Nieprawidłowy format tokena push (oczekiwano ExponentPushToken lub ExpoPushToken): {token_clean}")
        return

    url = "https://exp.host/--/api/v2/push/send"
    payload = {
        "to": token_clean,
        "title": title,
        "body": body,
        "sound": "default",
        "channelId": "default",
        "priority": "high",
        "_displayInForeground": True,
        "data": data or {},
    }
    headers = {
        "Accept": "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        print(f"[Push] Expo response: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"[Push] Błąd podczas wysyłania powiadomienia push do Expo: {e}")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Nieprawidłowy token uwierzytelniający",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id_str = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        user_id = int(user_id_str)
    except (JWTError, ValueError):
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user


def render_verification_html(title: str, message: str, is_success: bool = True) -> str:
    color = "#38bdf8" if is_success else "#f87171"
    icon = "✓" if is_success else "✕"
    return f"""
    <!DOCTYPE html>
    <html lang="pl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{title} - SettleApp</title>
      </head>
      <body style="margin: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh;">
        <div style="background-color: #1e293b; padding: 40px; border-radius: 16px; border: 1px solid #334155; text-align: center; max-width: 420px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); margin: 20px;">
          <div style="width: 64px; height: 64px; background-color: rgba(56, 189, 248, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto; color: {color}; font-size: 32px; font-weight: bold;">
            {icon}
          </div>
          <h1 style="color: #f8fafc; font-size: 24px; margin-bottom: 12px; font-weight: 700;">{title}</h1>
          <p style="color: #94a3b8; font-size: 15px; line-height: 1.5; margin-bottom: 0;">
            {message}
          </p>
        </div>
      </body>
    </html>
    """


@router.post("/auth/register")
def register(
    payload: RegisterPayload,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Użytkownik o takim emailu już istnieje.")

    user = User(
        name=payload.name,
        email=payload.email,
        phone_number=payload.phone_number.strip(),
        hashed_password=get_password_hash(payload.password),
        is_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    verification_token = create_email_verification_token(user.email)
    background_tasks.add_task(send_verification_email, user.email, verification_token)

    return {
        "message": "Konto utworzone. Sprawdź swoją skrzynkę e-mail, aby potwierdzić adres przed logowaniem."
    }


@router.get("/auth/verify", response_class=HTMLResponse)
def verify_email(token: str, db: Session = Depends(get_db)):
    email = verify_email_token(token)
    if not email:
        return HTMLResponse(
            status_code=400,
            content=render_verification_html(
                "Błąd weryfikacji",
                "Link weryfikacyjny jest nieprawidłowy lub wygasł. Spróbuj zarejestrować się ponownie.",
                is_success=False,
            ),
        )

    user = db.query(User).filter(User.email == email).first()
    if not user:
        return HTMLResponse(
            status_code=404,
            content=render_verification_html(
                "Użytkownik nie istnieje",
                "Nie znaleziono konta powiązanego z tym adresem e-mail.",
                is_success=False,
            ),
        )

    if user.is_verified:
        return HTMLResponse(
            status_code=200,
            content=render_verification_html(
                "Konto już aktywne",
                "Twój adres e-mail został już wcześniej zweryfikowany. Możesz zalogować się w aplikacji.",
                is_success=True,
            ),
        )

    user.is_verified = True
    db.commit()
    return HTMLResponse(
        status_code=200,
        content=render_verification_html(
            "Konto aktywowane!",
            "Twój adres e-mail został pomyślnie zweryfikowany. Możesz teraz wrócić do aplikacji SettleApp i się zalogować.",
            is_success=True,
        ),
    )


@router.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginPayload, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Błędny email lub hasło.")

    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Adres e-mail nie został zweryfikowany. Sprawdź pocztę i kliknij link aktywacyjny.",
        )

    token = create_access_token({"sub": str(user.id)})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": user.id,
        "name": user.name,
        "phone_number": user.phone_number,
    }


@router.post("/auth/push-token")
def update_push_token(
    payload: PushTokenPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    clean_token = payload.token.strip()
    current_user.expo_push_token = clean_token
    db.commit()
    print(f"[Push] Zaktualizowano expo_push_token dla usera {current_user.id} ({current_user.name}): {clean_token}")
    return {"status": "ok", "message": "Token powiadomień zaktualizowany."}