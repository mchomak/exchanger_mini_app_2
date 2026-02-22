"""User settings model."""

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base


class UserSettings(Base):
    __tablename__ = "user_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), unique=True)
    default_currency_give: Mapped[str] = mapped_column(String(20), default="USDT TRC20")
    default_currency_get: Mapped[str] = mapped_column(String(20), default="Сбербанк RUB")
    notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    language: Mapped[str] = mapped_column(String(10), default="ru")

    user: Mapped["User"] = relationship(back_populates="settings")
