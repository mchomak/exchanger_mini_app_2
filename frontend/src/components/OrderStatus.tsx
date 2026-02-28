import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "../contexts/TranslationContext";
import { api } from "../api/client";
import type { OrderData } from "../types";

interface Props {
  order: OrderData;
  onNewExchange: () => void;
}

const PAYMENT_TIMEOUT_SECONDS = 30 * 60; // 30 minutes

export function OrderStatus({ order: initialOrder, onNewExchange }: Props) {
  const { t } = useTranslation();
  const [order, setOrder] = useState<OrderData>(initialOrder);
  const [secondsLeft, setSecondsLeft] = useState(PAYMENT_TIMEOUT_SECONDS);
  const [timerExpired, setTimerExpired] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isWaiting = order.status_title.toLowerCase().includes("ожидан") ||
    order.status_title.toLowerCase().includes("wait");

  const isPaidOrDone = ["оплач", "выполн", "paid", "done", "complet"].some(
    (kw) => order.status_title.toLowerCase().includes(kw)
  );

  const isError = ["ошибк", "отмен", "error", "cancel", "reject"].some(
    (kw) => order.status_title.toLowerCase().includes(kw)
  );

  // Poll for status changes every 10s while waiting
  useEffect(() => {
    if (!isWaiting) return;

    pollRef.current = setInterval(async () => {
      try {
        const updated = await api.getOrderStatus(order.hash);
        setOrder(updated);
      } catch {
        // ignore poll errors
      }
    }, 10000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [order.hash, isWaiting]);

  // Countdown timer
  useEffect(() => {
    if (!isWaiting) return;

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setTimerExpired(true);
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isWaiting]);

  // Stop polling when not waiting
  useEffect(() => {
    if (!isWaiting && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [isWaiting]);

  const handlePay = useCallback(() => {
    if (order.payment_url) {
      window.open(order.payment_url, "_blank");
    }
  }, [order.payment_url]);

  const handleDetails = useCallback(() => {
    window.open("https://t.me/sapsanpay", "_blank");
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Status color
  let statusColor = "text-ex-accent";
  if (isPaidOrDone) statusColor = "text-ex-positive";
  if (isError) statusColor = "text-ex-error";

  return (
    <div className="min-h-screen flex flex-col justify-center px-4 py-6 max-w-md mx-auto">
      <h1 className="font-secondary text-xl font-bold text-center text-ex-accent mb-8 tracking-wide">
        SAPSANEX
      </h1>

      <div className="bg-ex-block rounded-2xl p-5 shadow-lg">
        {/* Status icon */}
        <div className="flex justify-center mb-4">
          {isPaidOrDone ? (
            <div className="w-16 h-16 rounded-full bg-ex-positive/20 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3bb57a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
          ) : isError ? (
            <div className="w-16 h-16 rounded-full bg-ex-error/20 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#b93131" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-ex-accent/20 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ffcc9d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
          )}
        </div>

        {/* Title */}
        <h2 className={`text-lg font-semibold text-center mb-5 ${statusColor}`}>
          {order.status_title}
        </h2>

        {/* Order details */}
        <div className="space-y-3 mb-5">
          <div className="flex justify-between items-center bg-ex-block-sm rounded-xl px-4 py-3 border border-ex-divider">
            <span className="text-xs text-ex-text-sec uppercase">{t("order_id")}</span>
            <span className="text-sm font-medium text-ex-text">{order.id}</span>
          </div>

          <div className="flex justify-between items-center bg-ex-block-sm rounded-xl px-4 py-3 border border-ex-divider">
            <span className="text-xs text-ex-text-sec uppercase">{t("order_hash")}</span>
            <span className="text-xs font-mono text-ex-text truncate ml-2 max-w-[180px]">{order.hash}</span>
          </div>

          <div className="flex justify-between items-center bg-ex-block-sm rounded-xl px-4 py-3 border border-ex-divider">
            <span className="text-xs text-ex-text-sec uppercase">{t("order_status")}</span>
            <span className={`text-sm font-medium ${statusColor}`}>{order.status_title}</span>
          </div>

          <div className="flex justify-between items-center bg-ex-block-sm rounded-xl px-4 py-3 border border-ex-divider">
            <span className="text-xs text-ex-text-sec uppercase">{t("you_give")}</span>
            <span className="text-sm font-medium text-ex-text">
              {order.amount_give} {order.currency_give}
            </span>
          </div>

          <div className="flex justify-between items-center bg-ex-block-sm rounded-xl px-4 py-3 border border-ex-divider">
            <span className="text-xs text-ex-text-sec uppercase">{t("you_get")}</span>
            <span className="text-sm font-medium text-ex-text">
              {order.amount_get} {order.currency_get}
            </span>
          </div>

          {/* Order URL */}
          <a
            href={order.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex justify-between items-center bg-ex-block-sm rounded-xl px-4 py-3 border border-ex-divider"
          >
            <span className="text-xs text-ex-text-sec uppercase">{t("order_url")}</span>
            <span className="text-sm text-ex-accent underline">sapsanex.cc</span>
          </a>
        </div>

        {/* Timer (only when waiting) */}
        {isWaiting && !timerExpired && (
          <div className="text-center mb-5">
            <p className="text-xs text-ex-text-sec uppercase mb-1">{t("payment_timer")}</p>
            <p className="text-3xl font-mono font-bold text-ex-accent">{formatTime(secondsLeft)}</p>
          </div>
        )}

        {isWaiting && timerExpired && (
          <div className="text-center mb-5">
            <p className="text-sm text-ex-error font-medium">{t("timer_expired")}</p>
          </div>
        )}

        {/* Action buttons */}
        {isWaiting && order.payment_url && !timerExpired && (
          <button
            onClick={handlePay}
            className="w-full py-4 rounded-xl bg-ex-accent text-ex-block-sm font-semibold text-base
                       active:scale-[0.98] transition-transform shadow-md font-primary mb-3"
          >
            {t("pay_button")}
          </button>
        )}

        <button
          onClick={handleDetails}
          className="w-full py-3 rounded-xl bg-ex-block-sm text-ex-text-sec font-medium text-sm
                     border border-ex-divider active:scale-[0.98] transition-transform mb-3"
        >
          {t("details_button")}
        </button>

        <button
          onClick={onNewExchange}
          className="w-full py-3 rounded-xl bg-transparent text-ex-accent font-medium text-sm
                     border border-ex-accent/30 active:scale-[0.98] transition-transform"
        >
          {t("new_exchange")}
        </button>
      </div>
    </div>
  );
}
