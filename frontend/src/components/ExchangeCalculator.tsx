import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "../contexts/TranslationContext";
import { useExchanger } from "../hooks/useExchanger";
import { useDebounce } from "../hooks/useDebounce";
import { CurrencyModal } from "./CurrencyModal";
import { Loader } from "./Loader";
import type { CalcResult, Direction, UserSettings } from "../types";

interface Props {
  userSettings: UserSettings | null;
  onGoToConfirm?: (data: {
    calcResult: CalcResult;
    amountGive: string;
    amountGet: string;
    currencyGive: string;
    currencyGet: string;
    directionId: string;
  }) => void;
}

export function ExchangeCalculator({ userSettings, onGoToConfirm }: Props) {
  const { t } = useTranslation();
  const { directions, loading: directionsLoading, getDirections, calculate } = useExchanger();

  const [amountGive, setAmountGive] = useState("1");
  const [amountGet, setAmountGet] = useState("");
  const [currencyGive, setCurrencyGive] = useState("");
  const [currencyGet, setCurrencyGet] = useState("");
  const [currentDirection, setCurrentDirection] = useState<Direction | null>(null);
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [modalGiveOpen, setModalGiveOpen] = useState(false);
  const [modalGetOpen, setModalGetOpen] = useState(false);

  const editingRef = useRef<"give" | "get">("give");

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

  useEffect(() => {
    getDirections().then((dirs) => {
      if (dirs.length === 0) return;
      const defaultGive = userSettings?.default_currency_give || "USDT TRC20";
      const defaultGet = userSettings?.default_currency_get || "Сбербанк RUB";
      const giveLower = defaultGive.toLowerCase();
      const getKeywords = defaultGet.toLowerCase().split(/\s+/);

      let found = dirs.find((d) => {
        const gt = d.currency_give_title.toLowerCase();
        const gett = d.currency_get_title.toLowerCase();
        return gt.includes(giveLower) && getKeywords.every((kw) => gett.includes(kw));
      });
      if (!found) found = dirs[0];

      setCurrencyGive(found.currency_give_title);
      setCurrencyGet(found.currency_get_title);
      setCurrentDirection(found);
    });
  }, [getDirections, userSettings]);

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

  const debouncedCalc = useDebounce(
    (directionId: string, amount: number, action: string) => {
      if (amount <= 0 || isNaN(amount)) return;
      setCalcLoading(true);
      calculate(directionId, amount, action)
        .then((result) => {
          setCalcResult(result);
          if (action === "give") setAmountGet(result.sum_get);
          else setAmountGive(result.sum_give);
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
      if (currentDirection && !isNaN(amount) && amount > 0)
        debouncedCalc(currentDirection.direction_id, amount, "give");
    },
    [currentDirection, debouncedCalc]
  );

  const handleAmountGetChange = useCallback(
    (value: string) => {
      setAmountGet(value);
      editingRef.current = "get";
      const amount = parseFloat(value);
      if (currentDirection && !isNaN(amount) && amount > 0)
        debouncedCalc(currentDirection.direction_id, amount, "get");
    },
    [currentDirection, debouncedCalc]
  );

  const handleSelectGiveCurrency = useCallback(
    (code: string) => {
      setCurrencyGive(code);
      const dir = directions.find(
        (d) => d.currency_give_title === code && d.currency_get_title === currencyGet
      );
      if (dir) {
        setCurrentDirection(dir);
      } else {
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
      if (dir) setCurrentDirection(dir);
    },
    [directions, currencyGive]
  );

  // Swap currencies
  const handleSwap = useCallback(() => {
    const newDir = directions.find(
      (d) => d.currency_give_title === currencyGet && d.currency_get_title === currencyGive
    );
    if (!newDir) return; // reverse direction doesn't exist

    const prevGive = currencyGive;
    const prevGet = currencyGet;
    const prevAmountGive = amountGive;

    setCurrencyGive(prevGet);
    setCurrencyGet(prevGive);
    setAmountGive(prevAmountGive);
    setCurrentDirection(newDir);
  }, [directions, currencyGive, currencyGet, amountGive]);

  const swapAvailable = useMemo(() => {
    return directions.some(
      (d) => d.currency_give_title === currencyGet && d.currency_get_title === currencyGive
    );
  }, [directions, currencyGive, currencyGet]);

  const [validationError, setValidationError] = useState<string | null>(null);

  const handleExchange = useCallback(() => {
    setValidationError(null);

    if (!calcResult || !currentDirection) return;

    const amount = parseFloat(amountGive);
    if (isNaN(amount) || amount <= 0) return;

    // Validate min/max amounts
    if (calcResult.min_give !== "no") {
      const min = parseFloat(calcResult.min_give);
      if (!isNaN(min) && amount < min) {
        setValidationError(`${t("error_amount_min")} ${calcResult.min_give} ${calcResult.currency_give}`);
        return;
      }
    }
    if (calcResult.max_give !== "no") {
      const max = parseFloat(calcResult.max_give);
      if (!isNaN(max) && amount > max) {
        setValidationError(`${t("error_amount_max")} ${calcResult.max_give} ${calcResult.currency_give}`);
        return;
      }
    }

    onGoToConfirm?.({
      calcResult,
      amountGive,
      amountGet,
      currencyGive,
      currencyGet,
      directionId: currentDirection.direction_id,
    });
  }, [calcResult, currentDirection, amountGive, amountGet, currencyGive, currencyGet, t, onGoToConfirm]);

  const rateText = useMemo(() => {
    if (!calcResult) return "";
    return `1 ${calcResult.currency_give} = ${calcResult.course_get} ${calcResult.currency_get}`;
  }, [calcResult]);

  if (directionsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-4 py-6 max-w-md mx-auto">
      {/* Logo / Title */}
      <h1 className="font-secondary text-xl font-bold text-center text-ex-accent mb-8 tracking-wide">
        SAPSANEX
      </h1>

      {/* Card */}
      <div className="bg-ex-block rounded-2xl p-5 shadow-lg">
        {/* Give field */}
        <div className="mb-1">
          <label className="block text-xs font-medium text-ex-text-sec mb-2 uppercase tracking-wider">
            {t("you_give")}
          </label>
          <div className="flex items-center bg-ex-block-sm rounded-xl overflow-hidden border border-ex-divider">
            <input
              type="number"
              inputMode="decimal"
              value={amountGive}
              onChange={(e) => handleAmountGiveChange(e.target.value)}
              className="flex-1 bg-transparent px-4 py-4 text-xl font-medium text-ex-text min-w-0 placeholder-ex-text-sec"
              placeholder="0"
            />
            <button
              onClick={() => setModalGiveOpen(true)}
              className="flex items-center gap-1.5 px-4 py-4 text-ex-accent font-medium whitespace-nowrap text-sm transition-colors hover:bg-ex-hover active:bg-ex-selected"
            >
              <span>{currencyGive || "..."}</span>
              <svg width="12" height="8" viewBox="0 0 12 8" fill="none" className="opacity-60">
                <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Swap button */}
        <div className="flex justify-center -my-2 relative z-10">
          <button
            onClick={handleSwap}
            disabled={!swapAvailable}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all
              ${swapAvailable
                ? "bg-ex-accent text-ex-block-sm hover:scale-110 active:scale-95 shadow-md"
                : "bg-ex-block-sm text-ex-text-sec cursor-not-allowed opacity-40"
              }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 16V4M7 4L3 8M7 4L11 8" />
              <path d="M17 8V20M17 20L21 16M17 20L13 16" />
            </svg>
          </button>
        </div>

        {/* Get field */}
        <div className="mt-1">
          <label className="block text-xs font-medium text-ex-text-sec mb-2 uppercase tracking-wider">
            {t("you_get")}
          </label>
          <div className="flex items-center bg-ex-block-sm rounded-xl overflow-hidden border border-ex-divider">
            <input
              type="number"
              inputMode="decimal"
              value={amountGet}
              onChange={(e) => handleAmountGetChange(e.target.value)}
              className="flex-1 bg-transparent px-4 py-4 text-xl font-medium text-ex-text min-w-0 placeholder-ex-text-sec"
              placeholder="0"
            />
            <button
              onClick={() => setModalGetOpen(true)}
              className="flex items-center gap-1.5 px-4 py-4 text-ex-accent font-medium whitespace-nowrap text-sm transition-colors hover:bg-ex-hover active:bg-ex-selected"
            >
              <span>{currencyGet || "..."}</span>
              <svg width="12" height="8" viewBox="0 0 12 8" fill="none" className="opacity-60">
                <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Rate & info */}
        <div className="mt-4 space-y-1">
          {calcLoading ? (
            <Loader />
          ) : (
            calcResult && (
              <>
                <p className="text-sm text-ex-accent text-center font-medium">
                  {t("rate")}: {rateText}
                </p>
                {calcResult.min_give !== "no" && (
                  <p className="text-xs text-ex-text-sec text-center">
                    {t("min_amount")}: {calcResult.min_give} · {t("max_amount")}: {calcResult.max_give}{" "}
                    {calcResult.currency_give}
                  </p>
                )}
                {calcResult.reserve !== "no" && (
                  <p className="text-xs text-ex-text-sec text-center">
                    {t("reserve")}: {calcResult.reserve} {calcResult.currency_get}
                  </p>
                )}
              </>
            )
          )}
        </div>

        {/* Validation error */}
        {validationError && (
          <p className="mt-3 text-sm text-ex-error text-center font-medium">{validationError}</p>
        )}

        {/* Exchange button */}
        <button
          onClick={handleExchange}
          className="w-full mt-5 py-4 rounded-xl bg-ex-accent text-ex-block-sm font-semibold text-base
                     active:scale-[0.98] transition-transform shadow-md font-primary"
        >
          {t("exchange_button")}
        </button>
      </div>

      {/* Modals */}
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
