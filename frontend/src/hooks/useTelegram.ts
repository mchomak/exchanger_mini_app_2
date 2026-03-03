import { useEffect, useMemo, useState } from "react";

export function useTelegram() {
  // Use useState to allow re-reads if SDK wasn't ready on first render
  const [webApp, setWebApp] = useState(() => window.Telegram?.WebApp ?? null);

  useEffect(() => {
    // If WebApp wasn't available on first render, retry after short delay
    if (!webApp) {
      const timer = setTimeout(() => {
        const wa = window.Telegram?.WebApp ?? null;
        if (wa) {
          console.log("[useTelegram] WebApp found on retry");
          setWebApp(wa);
        } else {
          console.warn("[useTelegram] WebApp still not available after retry");
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [webApp]);

  const user = useMemo(() => webApp?.initDataUnsafe?.user ?? null, [webApp]);
  const initData = useMemo(() => webApp?.initData ?? "", [webApp]);
  const colorScheme = useMemo(() => webApp?.colorScheme ?? "light", [webApp]);

  // Debug: log SDK state on first render
  useEffect(() => {
    console.log("[useTelegram] webApp:", !!webApp);
    console.log("[useTelegram] initData length:", initData.length);
    console.log("[useTelegram] user:", user ? `id=${user.id}` : "null");
  }, [webApp, initData, user]);

  return { webApp, user, initData, colorScheme };
}
