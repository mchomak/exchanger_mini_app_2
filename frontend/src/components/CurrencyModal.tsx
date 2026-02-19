/**
 * Modal for selecting a currency from available directions.
 */

import React, { useState, useMemo } from "react";
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

  const filtered = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter(
      (o) =>
        o.title.toLowerCase().includes(lower) ||
        o.code.toLowerCase().includes(lower)
    );
  }, [options, search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-tg-bg rounded-t-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-tg-hint/20">
          <h3 className="text-lg font-semibold text-tg-text">{title}</h3>
          <button
            onClick={onClose}
            className="text-tg-hint text-2xl leading-none px-2"
          >
            &times;
          </button>
        </div>

        {/* Search */}
        <div className="p-4 pb-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            className="w-full px-4 py-3 rounded-xl bg-tg-secondary-bg text-tg-text
                       placeholder-tg-hint text-base"
          />
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 px-4 pb-4">
          {filtered.length === 0 ? (
            <p className="text-center text-tg-hint py-8">{t("no_directions")}</p>
          ) : (
            filtered.map((option) => (
              <button
                key={option.code}
                onClick={() => {
                  onSelect(option.code);
                  onClose();
                  setSearch("");
                }}
                className="w-full text-left px-4 py-3 rounded-xl mb-1
                           hover:bg-tg-secondary-bg active:bg-tg-secondary-bg
                           transition-colors text-tg-text"
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
