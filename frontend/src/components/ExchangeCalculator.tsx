/**
 * Main exchange calculator component.
 *
 * Displays two currency input fields (give/get) with real-time
 * recalculation and currency selection modals.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "../contexts/TranslationContext";
import { useExchanger } from "../hooks/useExchanger";
import { useDebounce } from "../hooks/useDebounce";
import { CurrencyModal } from "./CurrencyModal";
import { Loader } from "./Loader";
import type { CalcResult, Direction, UserSettings } from "../types";

interface Props {
  userSettings: UserSettings | null;
}

export function ExchangeCalculator({ userSettings }: Props) {
  const { t } = useTranslation();
  const { directions, loading: directionsLoading, getDirections, calculate, findDirection } =
    useExchanger();

  const [amountGive, setAmountGive] = useState("1");
  const [amountGet, setAmountGet] = useState("");
  const [currencyGive, setCurrencyGive] = useState("");
  const [currencyGet, setCurrencyGet] = useState("");
  const [currentDirection, setCurrentDirection] = useState<Direction | null>(null);
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [modalGiveOpen, setModalGiveOpen] = useState(false);
  const [modalGetOpen, setModalGetOpen] = useState(false);

  // Track which field the user is currently editing
  const editingRef = useRef<"give" | "get">("give");

  // Extract unique currency lists from directions
  const giveCurrencies = useMemo(() => {
    const seen = new Set<string>();
    return directions
      .filter((d) => {
        if (seen.has(d.currency_give_title)) return false;
        seen.add(d.currency_give_title);
        return true;
      })
      .map((d) => ({ code: d.currency_give_title, title: d.currency_give_title }));
  }, [directions]);

  const getCurrencies = useMemo(() => {
    if (!currencyGive) return [];
    const seen = new Set<string>();
    return directions
      .filter((d) => d.currency_give_title === currencyGive)
      .filter((d) => {
        if (seen.has(d.currency_get_title)) return false;
        seen.add(d.currency_get_title);
        return true;
      })
      .map((d) => ({ code: d.currency_get_title, title: d.currency_get_title }));
  }, [directions, currencyGive]);

  // Load directions on mount
  useEffect(() => {
    getDirections().then((dirs) => {
      if (dirs.length === 0) return;

      const defaultGive = userSettings?.default_currency_give || "USDT TRC20";
      const defaultGet = userSettings?.default_currency_get || "Сбербанк RUB";

      // Try to find the default direction
      const giveLower = defaultGive.toLowerCase();
      const getKeywords = defaultGet.toLowerCase().split(/\s+/);
      let found = dirs.find((d) => {
        const gt = d.currency_give_title.toLowerCase();
        const gett = d.currency_get_title.toLowerCase();
        return gt.includes(giveLower) && getKeywords.every((kw) => gett.includes(kw));
      });

      if (!found) {
        found = dirs[0];
      }

      setCurrencyGive(found.currency_give_title);
      setCurrencyGet(found.currency_get_title);
      setCurrentDirection(found);
    });
  }, [getDirections, userSettings]);

  // Recalculate when direction changes
  useEffect(() => {
    if (!currentDirection) return;
    const amount = parseFloat(amountGive);
    if (isNaN(amount) || amount <= 0) return;

    setCalcLoading(true);
    calculate(currentDirection.direction_id, amount, "give")
      .then((result) => {
        setCalcResult(result);
        setAmountGet(result.sum_get);
      })
      .catch(() => {})
      .finally(() => setCalcLoading(false));
  }, [currentDirection]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced recalculation
  const debouncedCalc = useDebounce(
    (directionId: string, amount: number, action: string) => {
      if (amount <= 0 || isNaN(amount)) return;
      setCalcLoading(true);
      calculate(directionId, amount, action)
        .then((result) => {
          setCalcResult(result);
          if (action === "give") {
            setAmountGet(result.sum_get);
          } else {
            setAmountGive(result.sum_give);
          }
        })
        .catch(() => {})
        .finally(() => setCalcLoading(false));
    },
    500
  );

  const handleAmountGiveChange = useCallback(
    (value: string) => {
      setAmountGive(value);
      editingRef.current = "give";
      const amount = parseFloat(value);
      if (currentDirection && !isNaN(amount) && amount > 0) {
        debouncedCalc(currentDirection.direction_id, amount, "give");
      }
    },
    [currentDirection, debouncedCalc]
  );

  const handleAmountGetChange = useCallback(
    (value: string) => {
      setAmountGet(value);
      editingRef.current = "get";
      const amount = parseFloat(value);
      if (currentDirection && !isNaN(amount) && amount > 0) {
        debouncedCalc(currentDirection.direction_id, amount, "get");
      }
    },
    [currentDirection, debouncedCalc]
  );

  const handleSelectGiveCurrency = useCallback(
    (code: string) => {
      setCurrencyGive(code);
      // Find a matching direction with the new give currency
      const dir = directions.find(
        (d) => d.currency_give_title === code && d.currency_get_title === currencyGet
      );
      if (dir) {
        setCurrentDirection(dir);
      } else {
        // Pick the first available get currency for this give currency
        const firstDir = directions.find((d) => d.currency_give_title === code);
        if (firstDir) {
          setCurrencyGet(firstDir.currency_get_title);
          setCurrentDirection(firstDir);
        }
      }
    },
    [directions, currencyGet]
  );

  const handleSelectGetCurrency = useCallback(
    (code: string) => {
      setCurrencyGet(code);
      const dir = directions.find(
        (d) => d.currency_give_title === currencyGive && d.currency_get_title === code
      );
      if (dir) {
        setCurrentDirection(dir);
      }
    },
    [directions, currencyGive]
  );

  const handleExchange = useCallback(() => {
    alert(t("feature_in_development"));
  }, [t]);

  // Rate display
  const rateText = useMemo(() => {
    if (!calcResult) return "";
    return `1 ${calcResult.currency_give} = ${calcResult.course_get} ${calcResult.currency_get}`;
  }, [calcResult]);

  if (directionsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      {/* Give field */}
      <div className="mb-4">
        <label className="block text-sm text-tg-hint mb-2">{t("you_give")}</label>
        <div className="flex items-center bg-tg-secondary-bg rounded-xl overflow-hidden">
          <input
            type="number"
            inputMode="decimal"
            value={amountGive}
            onChange={(e) => handleAmountGiveChange(e.target.value)}
            className="flex-1 bg-transparent px-4 py-4 text-lg text-tg-text min-w-0"
            placeholder="0"
          />
          <button
            onClick={() => setModalGiveOpen(true)}
            className="px-4 py-4 text-tg-link font-medium whitespace-nowrap
                       border-l border-tg-hint/20 text-sm"
          >
            {currencyGive || "..."} ▼
          </button>
        </div>
      </div>

      {/* Get field */}
      <div className="mb-4">
        <label className="block text-sm text-tg-hint mb-2">{t("you_get")}</label>
        <div className="flex items-center bg-tg-secondary-bg rounded-xl overflow-hidden">
          <input
            type="number"
            inputMode="decimal"
            value={amountGet}
            onChange={(e) => handleAmountGetChange(e.target.value)}
            className="flex-1 bg-transparent px-4 py-4 text-lg text-tg-text min-w-0"
            placeholder="0"
          />
          <button
            onClick={() => setModalGetOpen(true)}
            className="px-4 py-4 text-tg-link font-medium whitespace-nowrap
                       border-l border-tg-hint/20 text-sm"
          >
            {currencyGet || "..."} ▼
          </button>
        </div>
      </div>

      {/* Rate & info */}
      <div className="mb-6 space-y-1">
        {calcLoading ? (
          <Loader />
        ) : (
          calcResult && (
            <>
              <p className="text-sm text-tg-hint text-center">
                {t("rate")}: {rateText}
              </p>
              {calcResult.min_give !== "no" && (
                <p className="text-xs text-tg-hint text-center">
                  {t("min_amount")}: {calcResult.min_give} · {t("max_amount")}:{" "}
                  {calcResult.max_give} {calcResult.currency_give}
                </p>
              )}
              {calcResult.reserve !== "no" && (
                <p className="text-xs text-tg-hint text-center">
                  {t("reserve")}: {calcResult.reserve} {calcResult.currency_get}
                </p>
              )}
            </>
          )
        )}
      </div>

      {/* Exchange button */}
      <button
        onClick={handleExchange}
        className="w-full py-4 rounded-xl bg-tg-button text-tg-button-text
                   font-semibold text-lg active:opacity-80 transition-opacity"
      >
        {t("exchange_button")}
      </button>

      {/* Currency modals */}
      <CurrencyModal
        open={modalGiveOpen}
        onClose={() => setModalGiveOpen(false)}
        onSelect={handleSelectGiveCurrency}
        options={giveCurrencies}
        title={t("you_give")}
      />
      <CurrencyModal
        open={modalGetOpen}
        onClose={() => setModalGetOpen(false)}
        onSelect={handleSelectGetCurrency}
        options={getCurrencies}
        title={t("you_get")}
      />
    </div>
  );
}
