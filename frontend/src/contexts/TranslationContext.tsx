/**
 * Translation context for multi-language support.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import type { Translations } from "../types";

interface TranslationContextValue {
  t: (key: string) => string;
  lang: string;
  setLang: (lang: string) => void;
  loading: boolean;
}

const TranslationContext = createContext<TranslationContextValue>({
  t: (key) => key,
  lang: "ru",
  setLang: () => {},
  loading: true,
});

export function TranslationProvider({
  children,
  defaultLang = "ru",
}: {
  children: React.ReactNode;
  defaultLang?: string;
}) {
  const [lang, setLang] = useState(defaultLang);
  const [phrases, setPhrases] = useState<Translations>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .getTranslations(lang)
      .then((data) => setPhrases(data))
      .catch(() => setPhrases({}))
      .finally(() => setLoading(false));
  }, [lang]);

  const t = useCallback((key: string) => phrases[key] ?? key, [phrases]);

  return (
    <TranslationContext.Provider value={{ t, lang, setLang, loading }}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  return useContext(TranslationContext);
}
