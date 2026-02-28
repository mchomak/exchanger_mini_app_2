import React from "react";
import { useTranslation } from "../contexts/TranslationContext";
import type { CalcResult } from "../types";

interface Props {
  calcResult: CalcResult;
  amountGive: string;
  amountGet: string;
  currencyGive: string;
  currencyGet: string;
  onConfirm: () => void;
  onBack: () => void;
  loading: boolean;
}

export function ConfirmationView({
  calcResult,
  amountGive,
  amountGet,
  currencyGive,
  currencyGet,
  onConfirm,
  onBack,
  loading,
}: Props) {
  const { t } = useTranslation();

  const rateText = `1 ${calcResult.currency_give} = ${calcResult.course_get} ${calcResult.currency_get}`;

  return (
    <div className="min-h-screen flex flex-col justify-center px-4 py-6 max-w-md mx-auto">
      <h1 className="font-secondary text-xl font-bold text-center text-ex-accent mb-8 tracking-wide">
        SAPSANEX
      </h1>

      <div className="bg-ex-block rounded-2xl p-5 shadow-lg">
        <h2 className="text-lg font-semibold text-ex-text text-center mb-6">
          {t("confirm_title")}
        </h2>

        {/* Give */}
        <div className="bg-ex-block-sm rounded-xl p-4 mb-3 border border-ex-divider">
          <p className="text-xs text-ex-text-sec uppercase tracking-wider mb-1">
            {t("you_give")}
          </p>
          <p className="text-xl font-medium text-ex-text">
            {amountGive} <span className="text-ex-accent text-base">{currencyGive}</span>
          </p>
        </div>

        {/* Arrow */}
        <div className="flex justify-center -my-1 relative z-10">
          <div className="w-8 h-8 rounded-full bg-ex-accent flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#224748" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Get */}
        <div className="bg-ex-block-sm rounded-xl p-4 mb-4 border border-ex-divider">
          <p className="text-xs text-ex-text-sec uppercase tracking-wider mb-1">
            {t("you_get")}
          </p>
          <p className="text-xl font-medium text-ex-text">
            {amountGet} <span className="text-ex-accent text-base">{currencyGet}</span>
          </p>
        </div>

        {/* Rate */}
        <p className="text-sm text-ex-accent text-center font-medium mb-6">
          {t("confirm_rate")}: {rateText}
        </p>

        {/* Buttons */}
        <button
          onClick={onConfirm}
          disabled={loading}
          className="w-full py-4 rounded-xl bg-ex-accent text-ex-block-sm font-semibold text-base
                     active:scale-[0.98] transition-transform shadow-md font-primary
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t("creating_order") : t("confirm_button")}
        </button>

        <button
          onClick={onBack}
          disabled={loading}
          className="w-full mt-3 py-3 rounded-xl bg-ex-block-sm text-ex-text-sec font-medium text-sm
                     border border-ex-divider active:scale-[0.98] transition-transform
                     disabled:opacity-50"
        >
          {t("back_button")}
        </button>
      </div>
    </div>
  );
}
