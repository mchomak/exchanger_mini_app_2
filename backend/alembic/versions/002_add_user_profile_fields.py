"""Add saved_full_name and saved_email to user_settings.

Revision ID: 002
Revises: 001
Create Date: 2025-01-02 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_settings", sa.Column("saved_full_name", sa.String(255), nullable=True))
    op.add_column("user_settings", sa.Column("saved_email", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("user_settings", "saved_email")
    op.drop_column("user_settings", "saved_full_name")
