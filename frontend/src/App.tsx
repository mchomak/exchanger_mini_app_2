/**
 * Main application component.
 *
 * Initializes Telegram WebApp, authenticates user,
 * loads translations, and renders the exchange calculator.
 */

import React, { useEffect, useState } from "react";
import { TranslationProvider } from "./contexts/TranslationContext";
import { useTelegram } from "./hooks/useTelegram";
import { api } from "./api/client";
import { ExchangeCalculator } from "./components/ExchangeCalculator";
import { Loader } from "./components/Loader";
import type { UserData } from "./types";

function AppContent() {
  const { webApp, user, initData } = useTelegram();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Tell Telegram the app is ready
    webApp?.ready();
    webApp?.expand();
  }, [webApp]);

  useEffect(() => {
    if (!initData) {
      // Running outside Telegram — skip auth for dev mode
      setLoading(false);
      return;
    }

    api
      .initUser(initData)
      .then((data) => {
        setUserData(data);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
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
      <div className="flex items-center justify-center h-screen p-4">
        <p className="text-red-500 text-center">{error}</p>
      </div>
    );
  }

  return <ExchangeCalculator userSettings={userData?.settings ?? null} />;
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
