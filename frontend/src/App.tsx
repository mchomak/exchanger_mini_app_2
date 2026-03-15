import React, { useCallback, useEffect, useRef, useState } from "react";
import { TranslationProvider } from "./contexts/TranslationContext";
import { useTelegram } from "./hooks/useTelegram";
import { api } from "./api/client";
import { ExchangeCalculator } from "./components/ExchangeCalculator";
import { ConfirmationView } from "./components/ConfirmationView";
import { FieldsForm } from "./components/FieldsForm";
import { OrderStatus } from "./components/OrderStatus";
import { ExchangeHistory } from "./components/ExchangeHistory";
import { SettingsScreen } from "./components/SettingsScreen";
import { Footer, Tab } from "./components/Footer";
import { Loader } from "./components/Loader";
import type { CalcResult, OrderData, UserData, UserAccounts } from "./types";

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

  // Tab navigation
  const [activeTab, setActiveTab] = useState<Tab>("home");

  // Exchange flow state — restore from sessionStorage if available
  const [view, setView] = useState<AppView>(() => {
    const saved = sessionStorage.getItem("app_view");
    return (saved === "confirmation" || saved === "fields") ? saved as AppView : "calculator";
  });
  const [confirmData, setConfirmData] = useState<ConfirmData | null>(() => {
    try {
      const saved = sessionStorage.getItem("app_confirmData");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [exchangeFields, setExchangeFields] = useState<Record<string, string>>({});
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);

  // Persist view and confirmData to sessionStorage
  useEffect(() => {
    sessionStorage.setItem("app_view", view);
    if (confirmData) {
      sessionStorage.setItem("app_confirmData", JSON.stringify(confirmData));
    } else {
      sessionStorage.removeItem("app_confirmData");
    }
  }, [view, confirmData]);

  // Saved accounts for FieldsForm dropdowns
  const [accounts, setAccounts] = useState<UserAccounts>({ cards: [], wallets: [], phones: [] });

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
      const timer = setTimeout(() => {
        if (!initData && !initAttempted.current) {
          console.warn("[App] initData still empty after wait, proceeding without auth");
          setLoading(false);
        }
      }, 500);
      return () => clearTimeout(timer);
    }

    if (initAttempted.current && userData) return;

    initAttempted.current = true;
    doInitUser(initData);
  }, [initData, doInitUser, userData, user]);

  // Get telegramId
  const telegramId = userData?.telegram_id || user?.id || 0;

  // Load saved accounts when user is available
  const loadAccounts = useCallback(() => {
    if (!telegramId) return;
    api.getUserAccounts(telegramId).then(setAccounts).catch(() => {});
  }, [telegramId]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Tab change handler — reset exchange flow when going to home
  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    if (tab === "home") {
      // Reload accounts to pick up any changes made in settings
      loadAccounts();
      // Reset to calculator if not in active exchange flow
      if (view !== "order" || !orderData) {
        setView("calculator");
        setConfirmData(null);
        setOrderData(null);
        setExchangeFields({});
        sessionStorage.removeItem("app_view");
        sessionStorage.removeItem("app_confirmData");
      }
    }
  }, [view, orderData, loadAccounts]);

  // Calculator → Confirmation
  const handleGoToConfirm = useCallback((data: ConfirmData) => {
    setConfirmData(data);
    setView("confirmation");
  }, []);

  const handleBackToCalc = useCallback(() => {
    setView("calculator");
  }, []);

  const handleGoToFields = useCallback(() => {
    setView("fields");
  }, []);

  const handleBackToConfirm = useCallback(() => {
    setView("confirmation");
  }, []);

  // Error specific to the fields/order creation step (shown inline, not global)
  const [fieldsError, setFieldsError] = useState<string | null>(null);

  // Fields Form → Create Order → Order Status
  const handleFieldsSubmit = useCallback(
    async (fields: Record<string, string>) => {
      if (!confirmData) return;

      if (!telegramId) {
        setFieldsError("Telegram ID not found. Please reopen the app from the bot.");
        return;
      }

      setFieldsError(null);
      setExchangeFields(fields);
      setOrderLoading(true);
      setView("order");

      try {
        const result = await api.createOrder(
          confirmData.directionId,
          parseFloat(confirmData.amountGive),
          fields,
          telegramId
        );
        setOrderData(result);
        // Reload accounts in case FieldsForm saved new requisites
        loadAccounts();
      } catch (err: any) {
        setFieldsError(err.message || "Order creation failed");
        setView("fields");
      } finally {
        setOrderLoading(false);
      }
    },
    [confirmData, telegramId, loadAccounts]
  );

  const handleNewExchange = useCallback(() => {
    setOrderData(null);
    setConfirmData(null);
    setExchangeFields({});
    setView("calculator");
    sessionStorage.removeItem("app_view");
    sessionStorage.removeItem("app_confirmData");
  }, []);

  // Handle error OK
  const handleErrorOk = useCallback(() => {
    setError(null);
    if (initData && !userData) {
      setLoading(true);
      initAttempted.current = false;
      doInitUser(initData);
    } else {
      setView("calculator");
    }
  }, [initData, userData, doInitUser]);

  // Refresh userData after profile save in Settings
  const handleProfileSaved = useCallback(() => {
    if (initData) {
      api.initUser(initData).then(setUserData).catch(() => {});
    }
  }, [initData]);

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

  // Exchange flow views (no footer during active exchange flow except calculator)
  const inExchangeFlow = view !== "calculator" && activeTab === "home";

  if (inExchangeFlow) {
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
          savedCards={accounts.cards}
          savedWallets={accounts.wallets}
          savedPhones={accounts.phones}
          telegramId={telegramId}
          onSubmit={handleFieldsSubmit}
          onBack={() => { setFieldsError(null); handleBackToConfirm(); }}
          submitError={fieldsError}
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
  }

  // Tab-based views with footer
  return (
    <>
      {activeTab === "home" && (
        <div className="pb-16">
          <ExchangeCalculator
            userSettings={userData?.settings ?? null}
            onGoToConfirm={handleGoToConfirm}
          />
        </div>
      )}
      {activeTab === "history" && (
        <div className="pb-16">
          <ExchangeHistory telegramId={telegramId} />
        </div>
      )}
      {activeTab === "settings" && (
        <div className="pb-16">
          <SettingsScreen
            telegramId={telegramId}
            savedFullName={userData?.settings?.saved_full_name ?? null}
            savedEmail={userData?.settings?.saved_email ?? null}
            onProfileSaved={handleProfileSaved}
            onAccountsChanged={loadAccounts}
          />
        </div>
      )}
      <Footer activeTab={activeTab} onTabChange={handleTabChange} />
    </>
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
