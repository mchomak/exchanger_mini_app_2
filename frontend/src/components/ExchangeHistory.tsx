import React, { useEffect, useState } from "react";
import { useTranslation } from "../contexts/TranslationContext";
import { api } from "../api/client";
import { Loader } from "./Loader";
import type { ExchangeHistoryItem } from "../types";

interface Props {
  telegramId: number;
}

function isSuccess(status: string | null): boolean {
  if (!status) return false;
  const l = status.toLowerCase();
  return ["оплач", "выполн", "paid", "done", "complet", "success"].some((kw) => l.includes(kw));
}

function isError(status: string | null): boolean {
  if (!status) return false;
  const l = status.toLowerCase();
  return ["ошибк", "отмен", "error", "cancel", "reject", "fail"].some((kw) => l.includes(kw));
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ExchangeHistory({ telegramId }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ExchangeHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!telegramId) return;
    api
      .getExchangeHistory(telegramId)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [telegramId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-md mx-auto pb-20">
      <h1 className="font-secondary text-xl font-bold text-center text-ex-accent mb-6 tracking-wide">
        SAPSANEX
      </h1>
      <h2 className="text-lg font-semibold text-ex-text text-center mb-4">
        {t("history_title")}
      </h2>

      {items.length === 0 ? (
        <div className="bg-ex-block rounded-2xl p-8 shadow-lg text-center">
          <p className="text-ex-text-sec text-sm">{t("history_empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const success = isSuccess(item.status);
            const error = isError(item.status);
            return (
              <div
                key={item.id}
                className="bg-ex-block rounded-2xl p-4 shadow-lg border border-ex-divider"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {success ? (
                      <div className="w-6 h-6 rounded-full bg-ex-positive/20 flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3bb57a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </div>
                    ) : error ? (
                      <div className="w-6 h-6 rounded-full bg-ex-error/20 flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b93131" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-ex-accent/20 flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffcc9d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 6v6l4 2" />
                        </svg>
                      </div>
                    )}
                    <span className="text-sm font-medium text-ex-text">
                      {item.currency_give} → {item.currency_get}
                    </span>
                  </div>
                  <span className="text-[10px] text-ex-text-sec">{formatDate(item.created_at)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-ex-text-sec">
                    {item.amount_give} → {item.amount_get}
                  </span>
                  <span className={`text-xs font-medium ${success ? "text-ex-positive" : error ? "text-ex-error" : "text-ex-accent"}`}>
                    {item.status_title || item.status || "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
