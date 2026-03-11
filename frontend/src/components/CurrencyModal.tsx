import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "../contexts/TranslationContext";

interface CurrencyOption {
  code: string;
  title: string;
}

interface CurrencyModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (code: string) => void;
  options: CurrencyOption[];
  title: string;
}

export function CurrencyModal({ open, onClose, onSelect, options, title }: CurrencyModalProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter(
      (o) => o.title.toLowerCase().includes(lower) || o.code.toLowerCase().includes(lower)
    );
  }, [options, search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0"
        style={{ background: "var(--popup-overlay)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-ex-popup rounded-t-2xl flex flex-col" style={{ maxHeight: "80vh" }}>
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-ex-divider">
          <h3 className="text-base font-semibold text-ex-text font-primary">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-ex-text-sec hover:bg-ex-hover transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1L13 13M13 1L1 13" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="flex-shrink-0 p-4 pb-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            className="w-full px-4 py-3 rounded-xl bg-ex-block-sm text-ex-text placeholder-ex-text-sec
                       text-sm border border-ex-divider font-primary"
          />
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 min-h-0 px-3" style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 1rem))" }}>
          {filtered.length === 0 ? (
            <p className="text-center text-ex-text-sec py-8 text-sm">{t("no_directions")}</p>
          ) : (
            filtered.map((option) => (
              <button
                key={option.code}
                onClick={() => {
                  onSelect(option.code);
                  onClose();
                  setSearch("");
                }}
                className="w-full text-left px-4 py-3 rounded-xl mb-0.5 text-ex-text text-sm font-primary
                           hover:bg-ex-hover active:bg-ex-selected transition-colors"
              >
                {option.title}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
