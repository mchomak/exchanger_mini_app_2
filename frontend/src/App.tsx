import React, { useCallback, useEffect, useRef, useState } from "react";
import { TranslationProvider } from "./contexts/TranslationContext";
import { useTelegram } from "./hooks/useTelegram";
import { api } from "./api/client";
import { ExchangeCalculator } from "./components/ExchangeCalculator";
import { ConfirmationView } from "./components/ConfirmationView";
import { FieldsForm } from "./components/FieldsForm";
import { OrderStatus } from "./components/OrderStatus";
import { Loader } from "./components/Loader";
import type { CalcResult, OrderData, UserData } from "./types";

type AppView = "calculator" | "confirmation" | "fields" | "order";

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
  const initAttempted = useRef(false);

  const [view, setView] = useState<AppView>("calculator");
  const [confirmData, setConfirmData] = useState<ConfirmData | null>(null);
  const [exchangeFields, setExchangeFields] = useState<Record<string, string>>({});
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);

  useEffect(() => {
    webApp?.ready();
    webApp?.expand();
  }, [webApp]);

  // Initialize user via API
  const doInitUser = useCallback(async (data: string) => {
    console.log("[App] doInitUser called, initData length:", data.length);
    try {
      const result = await api.initUser(data);
      console.log("[App] initUser success, telegram_id:", result.telegram_id);
      console.log("[App] settings:", JSON.stringify(result.settings));
      setUserData(result);
      setError(null);
    } catch (err: any) {
      console.error("[App] initUser failed:", err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Try to init user when initData becomes available
  useEffect(() => {
    if (!initData) {
      console.log("[App] No initData available yet, user from SDK:", user ? `id=${user.id}` : "null");
      // Only stop loading if we've given the SDK time to initialize
      // The useTelegram hook will retry after 150ms if SDK wasn't ready
      const timer = setTimeout(() => {
        if (!initData && !initAttempted.current) {
          console.warn("[App] initData still empty after wait, proceeding without auth");
          setLoading(false);
        }
      }, 500);
      return () => clearTimeout(timer);
    }

    if (initAttempted.current && userData) {
      // Already successfully initialized, don't re-init
      return;
    }

    initAttempted.current = true;
    doInitUser(initData);
  }, [initData, doInitUser, userData, user]);

  // Get telegramId from multiple sources (userData takes priority, then SDK user)
  const telegramId = userData?.telegram_id || user?.id || 0;

  // Calculator → Confirmation
  const handleGoToConfirm = useCallback((data: ConfirmData) => {
    setConfirmData(data);
    setView("confirmation");
  }, []);

  // Confirmation → Back to Calculator
  const handleBackToCalc = useCallback(() => {
    setView("calculator");
  }, []);

  // Confirmation → Fields Form
  const handleGoToFields = useCallback(() => {
    setView("fields");
  }, []);

  // Fields Form → Back to Confirmation
  const handleBackToConfirm = useCallback(() => {
    setView("confirmation");
  }, []);

  // Fields Form → Create Order → Order Status
  const handleFieldsSubmit = useCallback(
    async (fields: Record<string, string>) => {
      if (!confirmData) return;

      if (!telegramId) {
        console.error("[App] telegramId is 0/null, cannot create order");
        setError("Telegram ID not found. Please reopen the app from the bot.");
        return;
      }

      console.log("[App] Creating order with telegramId:", telegramId);
      setExchangeFields(fields);
      setOrderLoading(true);
      setView("order"); // show loading state in order view

      try {
        const result = await api.createOrder(
          confirmData.directionId,
          parseFloat(confirmData.amountGive),
          fields,
          telegramId
        );
        setOrderData(result);
      } catch (err: any) {
        setError(err.message || "Order creation failed");
        setView("fields"); // go back to fields on error
      } finally {
        setOrderLoading(false);
      }
    },
    [confirmData, telegramId]
  );

  // Order Status → New Exchange
  const handleNewExchange = useCallback(() => {
    setOrderData(null);
    setConfirmData(null);
    setExchangeFields({});
    setView("calculator");
  }, []);

  // Handle error OK — retry init if possible
  const handleErrorOk = useCallback(() => {
    setError(null);

    // If we have initData but userData is not loaded, retry init
    if (initData && !userData) {
      console.log("[App] Retrying initUser after error...");
      setLoading(true);
      initAttempted.current = false;
      doInitUser(initData);
    } else {
      setView("calculator");
    }
  }, [initData, userData, doInitUser]);

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
          onClick={handleErrorOk}
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
        onConfirm={handleGoToFields}
        onBack={handleBackToCalc}
        loading={false}
      />
    );
  }

  if (view === "fields" && confirmData) {
    return (
      <FieldsForm
        directionId={confirmData.directionId}
        currencyGive={confirmData.currencyGive}
        currencyGet={confirmData.currencyGet}
        telegramUsername={user?.username ?? null}
        savedFullName={userData?.settings?.saved_full_name ?? null}
        savedEmail={userData?.settings?.saved_email ?? null}
        savedPhone={userData?.settings?.saved_phone ?? null}
        telegramId={telegramId}
        onSubmit={handleFieldsSubmit}
        onBack={handleBackToConfirm}
      />
    );
  }

  if (view === "order") {
    if (orderLoading || !orderData) {
      return (
        <div className="flex items-center justify-center h-screen">
          <Loader />
        </div>
      );
    }
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
