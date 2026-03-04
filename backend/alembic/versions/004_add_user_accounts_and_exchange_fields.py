"""Add user_cards, user_crypto_wallets, user_phones tables and exchange extra fields.

Revision ID: 004
Revises: 003
Create Date: 2026-03-04 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # New columns on exchanges
    op.add_column("exchanges", sa.Column("status_title", sa.String(100), nullable=True))
    op.add_column("exchanges", sa.Column("error_message", sa.String(500), nullable=True))

    # User saved cards
    op.create_table(
        "user_cards",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("label", sa.String(100), nullable=True),
        sa.Column("card_number", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_user_cards_user_id", "user_cards", ["user_id"])

    # User saved crypto wallets
    op.create_table(
        "user_crypto_wallets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("label", sa.String(100), nullable=True),
        sa.Column("address", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_user_crypto_wallets_user_id", "user_crypto_wallets", ["user_id"])

    # User saved phones
    op.create_table(
        "user_phones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("label", sa.String(100), nullable=True),
        sa.Column("phone_number", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_user_phones_user_id", "user_phones", ["user_id"])


def downgrade() -> None:
    op.drop_table("user_phones")
    op.drop_table("user_crypto_wallets")
    op.drop_table("user_cards")
    op.drop_column("exchanges", "error_message")
    op.drop_column("exchanges", "status_title")
