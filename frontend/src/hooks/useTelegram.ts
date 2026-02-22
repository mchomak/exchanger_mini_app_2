import { useMemo } from "react";

export function useTelegram() {
  const webApp = useMemo(() => window.Telegram?.WebApp, []);
  const user = useMemo(() => webApp?.initDataUnsafe?.user ?? null, [webApp]);
  const initData = useMemo(() => webApp?.initData ?? "", [webApp]);
  const colorScheme = useMemo(() => webApp?.colorScheme ?? "light", [webApp]);

  return { webApp, user, initData, colorScheme };
}
