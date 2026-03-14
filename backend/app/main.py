"""FastAPI application entry point."""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.app.api.routes import router
from backend.app.core.config import settings
from backend.app.core.database import async_session
from backend.app.core.logging_config import setup_logging
from backend.app.models.exchange import Exchange
from backend.app.services.bot_notify import send_order_expired

setup_logging()
logger = logging.getLogger(__name__)

ORDER_EXPIRY_MINUTES = 30  # match frontend PAYMENT_TIMEOUT_SECONDS
EXPIRY_CHECK_INTERVAL = 60  # check every 60 seconds


async def _expire_old_orders():
    """Check for waiting orders past their expiry time and mark them cancelled."""
    while True:
        try:
            async with async_session() as db:
                cutoff = datetime.utcnow() - timedelta(minutes=ORDER_EXPIRY_MINUTES)
                result = await db.execute(
                    select(Exchange)
                    .where(
                        Exchange.created_at < cutoff,
                        Exchange.status.in_(["Ожидание оплаты", "Ожидает оплаты", "Waiting for payment"]),
                    )
                    .options(selectinload(Exchange.user))
                )
                expired = result.scalars().all()
                for ex in expired:
                    ex.status = "Отменена (истёк срок)"
                    ex.status_title = "Отменена (истёк срок)"
                    ex.error_message = "Время на оплату истекло"
                    ex.updated_at = datetime.utcnow()
                    logger.info(f"Order {ex.exchanger_order_hash} expired, marking cancelled")
                    if ex.user:
                        try:
                            await send_order_expired(ex.user.telegram_id, {
                                "id": ex.exchanger_order_id,
                                "hash": ex.exchanger_order_hash,
                                "amount_give": str(ex.amount_give),
                                "amount_get": str(ex.amount_get),
                                "currency_give": ex.currency_give_code,
                                "currency_get": ex.currency_get_code,
                            })
                        except Exception as e:
                            logger.error(f"Failed to notify about expired order: {e}")
                if expired:
                    await db.commit()
        except Exception as e:
            logger.error(f"Error in expire_old_orders: {e}")
        await asyncio.sleep(EXPIRY_CHECK_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_expire_old_orders())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Exchanger Mini App API",
    version="1.0.0",
    docs_url="/docs" if settings.debug else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"error": True, "message": "Internal server error"})


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"→ {request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"← {request.method} {request.url.path} [{response.status_code}]")
    return response
