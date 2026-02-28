import React, { useCallback, useEffect, useState } from "react";
import { TranslationProvider } from "./contexts/TranslationContext";
import { useTelegram } from "./hooks/useTelegram";
import { api } from "./api/client";
import { ExchangeCalculator } from "./components/ExchangeCalculator";
import { ConfirmationView } from "./components/ConfirmationView";
import { OrderStatus } from "./components/OrderStatus";
import { Loader } from "./components/Loader";
import type { CalcResult, OrderData, UserData } from "./types";

type AppView = "calculator" | "confirmation" | "order";

interface ConfirmData {
  calcResult: CalcResult;
  amountGive: string;
  amountGet: string;
  currencyGive: string;
  currencyGet: string;
  directionId: string;
}

function AppContent() {
  const { webApp, initData, user } = useTelegram();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<AppView>("calculator");
  const [confirmData, setConfirmData] = useState<ConfirmData | null>(null);
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);

  useEffect(() => {
    webApp?.ready();
    webApp?.expand();
  }, [webApp]);

  useEffect(() => {
    if (!initData) {
      setLoading(false);
      return;
    }
    api
      .initUser(initData)
      .then(setUserData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [initData]);

  // Calculator → Confirmation
  const handleGoToConfirm = useCallback((data: ConfirmData) => {
    setConfirmData(data);
    setView("confirmation");
  }, []);

  // Confirmation → Back to Calculator
  const handleBackToCalc = useCallback(() => {
    setView("calculator");
  }, []);

  // Confirmation → Create Order → Order Status
  const handleConfirmOrder = useCallback(async () => {
    if (!confirmData) return;

    const telegramId = userData?.telegram_id || user?.id;
    if (!telegramId) {
      setError("Telegram ID not found");
      return;
    }

    setOrderLoading(true);
    try {
      const result = await api.createOrder(
        confirmData.directionId,
        parseFloat(confirmData.amountGive),
        {}, // fields — пустой объект, так как поля не требуются для базового обмена
        telegramId
      );
      setOrderData(result);
      setView("order");
    } catch (err: any) {
      setError(err.message || "Order creation failed");
    } finally {
      setOrderLoading(false);
    }
  }, [confirmData, userData, user]);

  // Order Status → New Exchange
  const handleNewExchange = useCallback(() => {
    setOrderData(null);
    setConfirmData(null);
    setView("calculator");
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen p-4 flex-col gap-4">
        <p className="text-red-500 text-center">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setView("calculator");
          }}
          className="px-6 py-2 rounded-xl bg-ex-accent text-ex-block-sm font-medium text-sm"
        >
          OK
        </button>
      </div>
    );
  }

  if (view === "confirmation" && confirmData) {
    return (
      <ConfirmationView
        calcResult={confirmData.calcResult}
        amountGive={confirmData.amountGive}
        amountGet={confirmData.amountGet}
        currencyGive={confirmData.currencyGive}
        currencyGet={confirmData.currencyGet}
        onConfirm={handleConfirmOrder}
        onBack={handleBackToCalc}
        loading={orderLoading}
      />
    );
  }

  if (view === "order" && orderData) {
    return <OrderStatus order={orderData} onNewExchange={handleNewExchange} />;
  }

  return (
    <ExchangeCalculator
      userSettings={userData?.settings ?? null}
      onGoToConfirm={handleGoToConfirm}
    />
  );
}

export default function App() {
  const { user } = useTelegram();
  const defaultLang = user?.language_code?.startsWith("en") ? "en" : "ru";

  return (
    <TranslationProvider defaultLang={defaultLang}>
      <AppContent />
    </TranslationProvider>
  );
}
