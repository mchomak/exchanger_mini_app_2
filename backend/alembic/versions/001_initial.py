"""Initial migration — create users, exchanges, user_settings tables.

Revision ID: 001
Revises: None
Create Date: 2025-01-01 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("telegram_id", sa.BigInteger(), nullable=False, unique=True),
        sa.Column("username", sa.String(255)),
        sa.Column("first_name", sa.String(255)),
        sa.Column("last_name", sa.String(255)),
        sa.Column("language_code", sa.String(10), server_default="ru"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("last_active_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_users_telegram_id", "users", ["telegram_id"])

    op.create_table(
        "exchanges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("exchanger_order_id", sa.Integer()),
        sa.Column("exchanger_order_hash", sa.String(255), unique=True),
        sa.Column("direction_id", sa.String(50)),
        sa.Column("currency_give_code", sa.String(20)),
        sa.Column("currency_get_code", sa.String(20)),
        sa.Column("amount_give", sa.Numeric(20, 8)),
        sa.Column("amount_get", sa.Numeric(20, 8)),
        sa.Column("status", sa.String(50)),
        sa.Column("payment_type", sa.String(20)),
        sa.Column("can_cancel", sa.Boolean(), server_default="false"),
        sa.Column("can_pay_via_api", sa.Boolean(), server_default="false"),
        sa.Column("payment_url", sa.Text()),
        sa.Column("order_url", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("metadata", postgresql.JSONB()),
    )
    op.create_index("ix_exchanges_order_hash", "exchanges", ["exchanger_order_hash"])

    op.create_table(
        "user_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), unique=True),
        sa.Column("default_currency_give", sa.String(20), server_default="USDT TRC20"),
        sa.Column("default_currency_get", sa.String(20), server_default="Сбербанк RUB"),
        sa.Column("notifications_enabled", sa.Boolean(), server_default="true"),
        sa.Column("language", sa.String(10), server_default="ru"),
    )


def downgrade() -> None:
    op.drop_table("user_settings")
    op.drop_table("exchanges")
    op.drop_table("users")
