"""Exchange order model."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base


class Exchange(Base):
    __tablename__ = "exchanges"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    exchanger_order_id: Mapped[int | None] = mapped_column(Integer)
    exchanger_order_hash: Mapped[str | None] = mapped_column(String(255), unique=True)
    direction_id: Mapped[str | None] = mapped_column(String(50))
    currency_give_code: Mapped[str | None] = mapped_column(String(20))
    currency_get_code: Mapped[str | None] = mapped_column(String(20))
    amount_give: Mapped[Decimal | None] = mapped_column(Numeric(20, 8))
    amount_get: Mapped[Decimal | None] = mapped_column(Numeric(20, 8))
    status: Mapped[str | None] = mapped_column(String(50))
    payment_type: Mapped[str | None] = mapped_column(String(20))
    can_cancel: Mapped[bool] = mapped_column(Boolean, default=False)
    can_pay_via_api: Mapped[bool] = mapped_column(Boolean, default=False)
    payment_url: Mapped[str | None] = mapped_column(Text)
    order_url: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    metadata_json: Mapped[dict | None] = mapped_column("metadata", JSONB)

    user: Mapped["User"] = relationship(back_populates="exchanges")

    __table_args__ = (Index("ix_exchanges_order_hash", "exchanger_order_hash"),)
