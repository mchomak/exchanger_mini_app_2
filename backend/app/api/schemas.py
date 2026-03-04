"""Pydantic schemas for request/response validation."""

from typing import Dict, Optional

from pydantic import BaseModel, Field


class InitUserRequest(BaseModel):
    init_data: str = Field(..., description="Telegram WebApp initData string")


class UserSettingsResponse(BaseModel):
    default_currency_give: str = "USDT TRC20"
    default_currency_get: str = "Сбербанк RUB"
    notifications_enabled: bool = True
    language: str = "ru"
    saved_full_name: Optional[str] = None
    saved_email: Optional[str] = None
    saved_phone: Optional[str] = None


class UserResponse(BaseModel):
    id: int
    telegram_id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    language_code: str = "ru"
    settings: Optional[UserSettingsResponse] = None


class CalculateRequest(BaseModel):
    direction_id: str
    amount: float = Field(..., gt=0)
    calc_action: str = Field(default="give", pattern="^(give|get)$")


class CalculateResponse(BaseModel):
    sum_give: str
    sum_give_com: str
    sum_get: str
    sum_get_com: str
    currency_give: str
    currency_get: str
    course_give: str
    course_get: str
    reserve: str
    min_give: str
    max_give: str
    min_get: str
    max_get: str
    changed: bool


class CreateExchangeRequest(BaseModel):
    direction_id: str
    amount: float = Field(..., gt=0)
    fields: Dict[str, str]
    user_telegram_id: int


class SaveUserProfileRequest(BaseModel):
    telegram_id: int
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


class ErrorResponse(BaseModel):
    error: bool = True
    message: str


# ── Exchange History ─────────────────────────────────────────────────────────

class ExchangeHistoryItem(BaseModel):
    id: int
    currency_give: Optional[str] = None
    currency_get: Optional[str] = None
    amount_give: Optional[str] = None
    amount_get: Optional[str] = None
    status: Optional[str] = None
    status_title: Optional[str] = None
    error_message: Optional[str] = None
    created_at: Optional[str] = None


# ── User Accounts CRUD ───────────────────────────────────────────────────────

class UserCardItem(BaseModel):
    id: int
    label: Optional[str] = None
    card_number: str

class UserCardCreate(BaseModel):
    label: Optional[str] = None
    card_number: str = Field(..., min_length=8, max_length=30)

class UserCardUpdate(BaseModel):
    label: Optional[str] = None
    card_number: Optional[str] = Field(None, min_length=8, max_length=30)


class UserWalletItem(BaseModel):
    id: int
    label: Optional[str] = None
    address: str

class UserWalletCreate(BaseModel):
    label: Optional[str] = None
    address: str = Field(..., min_length=10, max_length=255)

class UserWalletUpdate(BaseModel):
    label: Optional[str] = None
    address: Optional[str] = Field(None, min_length=10, max_length=255)


class UserPhoneItem(BaseModel):
    id: int
    label: Optional[str] = None
    phone_number: str

class UserPhoneCreate(BaseModel):
    label: Optional[str] = None
    phone_number: str = Field(..., min_length=7, max_length=30)

class UserPhoneUpdate(BaseModel):
    label: Optional[str] = None
    phone_number: Optional[str] = Field(None, min_length=7, max_length=30)


class UserAccountsResponse(BaseModel):
    cards: list[UserCardItem] = []
    wallets: list[UserWalletItem] = []
    phones: list[UserPhoneItem] = []
