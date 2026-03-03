"""Add saved_phone to user_settings.

Revision ID: 003
Revises: 002
Create Date: 2025-01-03 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_settings", sa.Column("saved_phone", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("user_settings", "saved_phone")
