from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ==========================================
# --- USER SCHEMAS ---
# ==========================================

class UserBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=50, description="Imię lub nick użytkownika")
    email: EmailStr = Field(..., max_length=100, description="Poprawny adres e-mail")
    phone_number: Optional[str] = Field(
        None,
        pattern=r"^\d{9}$",
        description="Numer telefonu – do BLIKa (dokładnie 9 cyfr)"
    )


class UserCreate(UserBase):
    """Schemat rejestracji: wymaga hasła z minimalną długością."""
    phone_number: str = Field(
        ...,
        pattern=r"^\d{9}$",
        description="Numer telefonu – do BLIKa (dokładnie 9 cyfr)"
    )
    password: str = Field(..., min_length=8, max_length=128, description="Hasło użytkownika")


class UserLogin(BaseModel):
    """Schemat logowania JSON."""
    email: EmailStr
    password: str = Field(..., min_length=1)


class RegisterPayload(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone_number: str = Field(
        ...,
        pattern=r"^\d{9}$",
        description="Numer telefonu – do BLIKa (dokładnie 9 cyfr)"
    )


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    name: str
    phone_number: Optional[str] = None


class UserOut(UserBase):
    """Schemat wyjściowy: NIE zawiera hasła."""
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# --- GROUP SCHEMAS ---
# ==========================================

class GroupCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Nazwa lobby/grupy")


class GroupJoin(BaseModel):
    join_code: str = Field(..., min_length=4, max_length=10, description="Unikalny kod dołączenia")


class GroupOut(BaseModel):
    id: int
    name: str
    join_code: str
    created_at: datetime
    members: List[UserOut] = []

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# --- EXPENSE SCHEMAS ---
# ==========================================

class ExpenseCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=100, description="Tytuł wydatku")
    amount: int = Field(..., gt=0, description="Kwota w groszach/centach (musi być > 0)")
    payer_id: int = Field(..., gt=0, description="ID użytkownika płacącego")
    group_id: int = Field(..., gt=0, description="ID grupy/lobby")
    description: Optional[str] = Field(None, max_length=255)
    receipt_image: Optional[str] = None


class ExpenseOut(ExpenseCreate):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# --- TRANSFER SCHEMAS ---
# ==========================================

class TransferCreate(BaseModel):
    receiver_id: int = Field(..., gt=0)
    amount: int = Field(..., gt=0, description="Kwota przelewu w groszach/centach")


class TransferOut(BaseModel):
    id: int
    group_id: int
    sender_id: int
    receiver_id: int
    amount: int
    status: Literal["pending", "confirmed", "rejected"]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# --- BALANCE SCHEMAS ---
# ==========================================

class SettlementSuggestion(BaseModel):
    from_user_id: int
    from_user_name: str
    to_user_id: int
    to_user_name: str
    to_user_phone: Optional[str] = None
    amount_cents: int
    amount_pln: str


class BalanceOut(BaseModel):
    summary: str
    my_net_balance: Optional[int] = None
    all_balances: dict[int, int] = {}
    suggested_settlements: List[SettlementSuggestion] = []


class NotificationOut(BaseModel):
    id: int
    user_id: int
    group_id: int
    year: int
    month: int
    message: str
    created_at: datetime
    read_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class MonthlyMemberBreakdown(BaseModel):
    name: str
    amount: int


class MonthlySummaryOut(BaseModel):
    year: int
    month: int
    total_group_spent: int
    total_group_spent_pln: str
    my_spent: int
    my_spent_pln: str
    expense_count: int
    members_breakdown: List[MonthlyMemberBreakdown]