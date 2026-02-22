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


class ErrorResponse(BaseModel):
    error: bool = True
    message: str
