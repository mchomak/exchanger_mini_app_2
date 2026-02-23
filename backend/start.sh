#!/bin/bash
set -e

echo "Waiting for PostgreSQL..."
while ! python -c "
import asyncio, asyncpg, os
async def check():
    url = os.environ.get('DATABASE_URL', 'postgresql+asyncpg://user:password@postgres:5432/exchanger_db')
    # Extract connection params from asyncpg URL
    url = url.replace('postgresql+asyncpg://', 'postgresql://')
    conn = await asyncpg.connect(url)
    await conn.close()
asyncio.run(check())
" 2>/dev/null; do
    echo "  PostgreSQL not ready, retrying in 2s..."
    sleep 2
done
echo "PostgreSQL is ready!"

echo "Running migrations..."
alembic -c backend/alembic.ini upgrade head

echo "Starting API server..."
exec uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
