import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "../contexts/TranslationContext";
import { api } from "../api/client";
import { Loader } from "./Loader";
import type { DirectionField, UserCardItem, UserPhoneItem, UserWalletItem } from "../types";

interface Props {
  directionId: string;
  currencyGive: string;
  currencyGet: string;
  telegramUsername: string | null;
  savedFullName: string | null;
  savedEmail: string | null;
  savedPhone: string | null;
  savedCards: UserCardItem[];
  savedWallets: UserWalletItem[];
  savedPhones: UserPhoneItem[];
  telegramId: number;
  onSubmit: (fields: Record<string, string>) => void;
  onBack: () => void;
  submitError?: string | null;
}

// Heuristics to identify field type by label
function isNameField(label: string): boolean {
  const l = label.toLowerCase();
  return l.includes("фио") || l.includes("фамил") || l.includes("full name") || l.includes("ф.и.о");
}

function isEmailField(label: string): boolean {
  const l = label.toLowerCase();
  return l.includes("email") || l.includes("e-mail") || l.includes("почт") || l.includes("mail");
}

function isTelegramField(label: string): boolean {
  const l = label.toLowerCase();
  return l.includes("telegram") || l.includes("телеграм") || l === "тг" || l.includes("tg");
}

function isPhoneField(label: string): boolean {
  const l = label.toLowerCase();
  return l.includes("телефон") || l.includes("phone") || l.includes("номер тел");
}

function isCardField(label: string): boolean {
  const l = label.toLowerCase();
  return l.includes("карт") || l.includes("card") || l.includes("счёт") || l.includes("счет");
}

function isWalletField(label: string): boolean {
  const l = label.toLowerCase();
  return l.includes("кошел") || l.includes("wallet") || l.includes("адрес") || l.includes("address");
}

// "На карту" → "На номер" rename
function getDisplayLabel(label: string): string {
  const l = label.toLowerCase();
  if (l === "на карту" || l === "to card") return "На номер";
  return label;
}

function mapInputType(field: DirectionField): string {
  const l = field.label.toLowerCase();
  if (isEmailField(l)) return "email";
  if (isPhoneField(l)) return "tel";
  return "text";
}

// Validation
function validatePhone(value: string): boolean {
  if (!value.trim()) return true;
  return /^[+]?[\d\s()-]{7,20}$/.test(value.trim());
}

function validateEmail(value: string): boolean {
  if (!value.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Check if a field should show saved items dropdown (phone or card)
function hasDropdown(label: string): boolean {
  return isPhoneField(label) || isCardField(label) || isWalletField(label);
}

// Mask a value for display: show first/last chars, hide middle
// e.g. "4279380625835188" → "4279****5188", "+79261234567" → "+792****4567"
function maskValue(value: string): string {
  const clean = value.replace(/\s/g, "");
  if (clean.length <= 6) return clean;
  const showStart = clean.startsWith("+") ? 4 : 4;
  const showEnd = 4;
  return clean.slice(0, showStart) + "****" + clean.slice(-showEnd);
}

export function FieldsForm({
  directionId,
  currencyGive,
  currencyGet,
  telegramUsername,
  savedFullName,
  savedEmail,
  savedPhone,
  savedCards,
  savedWallets,
  savedPhones,
  telegramId,
  onSubmit,
  onBack,
  submitError,
}: Props) {
  const { t } = useTranslation();
  const [allFields, setAllFields] = useState<DirectionField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [autoSkipped, setAutoSkipped] = useState(false);

  // Load direction fields
  useEffect(() => {
    setLoading(true);
    api
      .getDirectionFields(directionId)
      .then((data) => {
        const fields = [...data.required_fields, ...data.optional_fields];
        setAllFields(fields);

        // Initialize values with auto-fill (only ФИО and email)
        const initial: Record<string, string> = {};
        for (const f of fields) {
          if (isTelegramField(f.label)) {
            initial[f.name] = telegramUsername ? `@${telegramUsername}` : "";
          } else if (isNameField(f.label) && savedFullName) {
            initial[f.name] = savedFullName;
          } else if (isEmailField(f.label) && savedEmail) {
            initial[f.name] = savedEmail;
          } else {
            initial[f.name] = "";
          }
        }
        // Restore previously saved form values from sessionStorage
        const savedValues = sessionStorage.getItem(`fields_${directionId}`);
        if (savedValues) {
          try {
            const parsed = JSON.parse(savedValues) as Record<string, string>;
            for (const key of Object.keys(initial)) {
              if (parsed[key] !== undefined && parsed[key] !== "") {
                initial[key] = parsed[key];
              }
            }
          } catch { /* ignore corrupt data */ }
        }
        setValues(initial);

        // If no visible fields, auto-skip
        const visibleFields = fields.filter((f) => !isTelegramField(f.label));
        if (visibleFields.length === 0) {
          setAutoSkipped(true);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [directionId, telegramUsername, savedFullName, savedEmail]);

  // Auto-skip if no fields to show
  useEffect(() => {
    if (autoSkipped && !loading) {
      onSubmit(values);
    }
  }, [autoSkipped, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist form values to sessionStorage on change
  useEffect(() => {
    if (Object.keys(values).length > 0) {
      sessionStorage.setItem(`fields_${directionId}`, JSON.stringify(values));
    }
  }, [values, directionId]);

  // Visible fields (exclude auto-filled telegram)
  const visibleFields = useMemo(
    () => allFields.filter((f) => !isTelegramField(f.label)),
    [allFields]
  );

  // Check if all required visible fields are filled
  const allRequiredFilled = useMemo(() => {
    return visibleFields
      .filter((f) => f.req)
      .every((f) => values[f.name]?.trim());
  }, [visibleFields, values]);

  const handleChange = (name: string, value: string, field?: DirectionField) => {
    let newValue = value;

    // Auto-prepend +7 for phone fields
    if (field && isPhoneField(field.label)) {
      const digits = value.replace(/[^\d+]/g, "");
      if (digits === "" || digits === "+") {
        newValue = "";
      } else if (!digits.startsWith("+")) {
        if (digits.startsWith("7") && digits.length > 1) {
          newValue = "+" + digits;
        } else if (digits.startsWith("8") && digits.length > 1) {
          newValue = "+7" + digits.slice(1);
        } else {
          newValue = "+7" + digits;
        }
      } else {
        newValue = digits;
      }
    }

    setValues((prev) => ({ ...prev, [name]: newValue }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};

    for (const f of visibleFields) {
      const val = values[f.name]?.trim() || "";
      if (f.req && !val) {
        errors[f.name] = t("field_required");
        continue;
      }
      if (!val) continue;
      if (isPhoneField(f.label) && !validatePhone(val)) {
        errors[f.name] = t("invalid_phone");
      } else if (isEmailField(f.label) && !validateEmail(val)) {
        errors[f.name] = t("invalid_email");
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    // Save ФИО, email, phone to DB for auto-fill next time
    let fullNameToSave: string | null = null;
    let emailToSave: string | null = null;
    let phoneToSave: string | null = null;
    for (const f of allFields) {
      const val = values[f.name]?.trim() || "";
      if (isNameField(f.label) && val) fullNameToSave = val;
      if (isEmailField(f.label) && val) emailToSave = val;
      if (isPhoneField(f.label) && val) phoneToSave = val;
    }
    if ((fullNameToSave || emailToSave || phoneToSave) && telegramId > 0) {
      try {
        await api.saveUserProfile(telegramId, fullNameToSave, emailToSave, phoneToSave);
      } catch {
        // non-critical
      }
    }

    // Save newly entered requisites into DB for quick selection next time
    if (telegramId > 0) {
      const normalizePhone = (value: string) => value.trim().replace(/^\+/, "");
      const knownCards = new Set(savedCards.map((card) => card.card_number.trim()));
      const knownWallets = new Set(savedWallets.map((wallet) => wallet.address.trim().toLowerCase()));
      const knownPhones = new Set(savedPhones.map((phone) => normalizePhone(phone.phone_number)));
      const tasks: Promise<unknown>[] = [];

      for (const field of allFields) {
        const rawValue = values[field.name]?.trim();
        if (!rawValue) continue;

        const displayLabel = getDisplayLabel(field.label);
        const treatAsPhone = isPhoneField(field.label) || displayLabel === "На номер";
        if (treatAsPhone) {
          const normalized = normalizePhone(rawValue);
          if (!knownPhones.has(normalized)) {
            knownPhones.add(normalized);
            tasks.push(api.addPhone(telegramId, rawValue));
          }
          continue;
        }

        if (isWalletField(field.label)) {
          const normalized = rawValue.toLowerCase();
          if (!knownWallets.has(normalized)) {
            knownWallets.add(normalized);
            tasks.push(api.addWallet(telegramId, rawValue));
          }
          continue;
        }

        if (isCardField(field.label) && !knownCards.has(rawValue)) {
          knownCards.add(rawValue);
          tasks.push(api.addCard(telegramId, rawValue));
        }
      }

      if (tasks.length > 0) {
        await Promise.allSettled(tasks);
      }
    }

    // Build final fields dict
    // For phone fields: strip "+" before sending — API expects digits only
    const phoneFieldNames = new Set(
      allFields.filter((f) => isPhoneField(f.label)).map((f) => f.name)
    );
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(values)) {
      const trimmed = val.trim();
      if (!trimmed) continue;
      result[key] = phoneFieldNames.has(key) ? trimmed.replace(/^\+/, "") : trimmed;
    }
    sessionStorage.removeItem(`fields_${directionId}`);
    onSubmit(result);
  };

  // Get dropdown items for a field
  const getDropdownItems = (field: DirectionField): { label: string; value: string }[] => {
    if (isPhoneField(field.label)) {
      return savedPhones.map((p) => ({
        label: p.label || maskValue(p.phone_number),
        value: p.phone_number.startsWith("+") ? p.phone_number : "+" + p.phone_number,
      }));
    }
    if (isCardField(field.label)) {
      // For "На карту" (renamed to "На номер") — show phones
      const displayLabel = getDisplayLabel(field.label);
      if (displayLabel === "На номер") {
        return savedPhones.map((p) => ({
          label: p.label || maskValue(p.phone_number),
          value: p.phone_number.startsWith("+") ? p.phone_number : "+" + p.phone_number,
        }));
      }
      return savedCards.map((c) => ({
        label: c.label || maskValue(c.card_number),
        value: c.card_number,
      }));
    }
    if (isWalletField(field.label)) {
      return savedWallets.map((w) => ({
        label: w.label || maskValue(w.address),
        value: w.address,
      }));
    }
    return [];
  };

  // Track which dropdown is currently open by field name
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!openDropdown) return;
      const ref = dropdownRefs.current[openDropdown];
      if (ref && !ref.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openDropdown]);

  const renderFieldInput = (field: DirectionField, isRequired: boolean) => {
    const displayLabel = getDisplayLabel(field.label);
    const showDropdown = hasDropdown(field.label);
    const dropdownItems = showDropdown ? getDropdownItems(field) : [];
    // For renamed "На карту" → "На номер", treat as phone field for input type
    const isRenamed = displayLabel === "На номер";
    const inputType = isRenamed ? "tel" : mapInputType(field);
    const placeholder = isPhoneField(field.label) || isRenamed ? "+7" : displayLabel;
    const currentValue = values[field.name] || "";
    const isOpen = openDropdown === field.name;

    return (
      <div key={field.name} className="mb-3">
        <label className="block text-xs font-medium text-ex-text-sec mb-1.5 uppercase tracking-wider">
          {displayLabel} {isRequired && <span className="text-ex-accent">*</span>}
        </label>
        <div className="relative">
          {showDropdown && dropdownItems.length > 0 && (
            <div
              className="relative mb-2"
              ref={(el) => { dropdownRefs.current[field.name] = el; }}
            >
              {/* Dropdown trigger button */}
              <button
                type="button"
                onClick={() => setOpenDropdown(isOpen ? null : field.name)}
                className="w-full text-left pl-3 pr-10 py-2.5 rounded-xl bg-ex-block text-ex-text text-xs border border-ex-divider focus:border-ex-accent focus:outline-none transition-colors"
              >
                {dropdownItems.some((item) => item.value === currentValue)
                  ? dropdownItems.find((item) => item.value === currentValue)!.label
                    ? `${dropdownItems.find((item) => item.value === currentValue)!.label} — ${currentValue}`
                    : currentValue
                  : t("field_select_saved")}
              </button>
              {/* Arrow icon */}
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-ex-accent">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              {/* Custom dropdown list */}
              {isOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-xl bg-ex-widget border border-ex-divider shadow-lg overflow-hidden">
                  <ul className="max-h-48 overflow-y-auto py-1">
                    {dropdownItems.map((item, idx) => {
                      const isSelected = item.value === currentValue;
                      return (
                        <li key={`${item.value}-${idx}`}>
                          <button
                            type="button"
                            onClick={() => {
                              handleChange(
                                field.name,
                                item.value,
                                isRenamed ? { ...field, label: "телефон" } : field
                              );
                              setOpenDropdown(null);
                            }}
                            className={`w-full text-left px-3 py-2.5 text-xs transition-colors
                              ${isSelected
                                ? "bg-ex-selected text-ex-accent"
                                : "text-ex-text hover:bg-ex-hover"
                              }`}
                          >
                            {item.label ? `${item.label} — ${item.value}` : item.value}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
          <input
            type={inputType}
            value={currentValue}
            onChange={(e) => handleChange(field.name, e.target.value, isRenamed ? { ...field, label: "телефон" } : field)}
            className={`w-full px-4 py-3 rounded-xl bg-ex-block-sm text-ex-text placeholder-ex-text-sec
                       text-sm border font-primary transition-colors
                       ${fieldErrors[field.name] ? "border-ex-error" : "border-ex-divider focus:border-ex-accent"}`}
            placeholder={placeholder}
          />
        </div>
        {fieldErrors[field.name] && (
          <p className="text-xs text-ex-error mt-1">{fieldErrors[field.name]}</p>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col justify-center px-4 py-6 max-w-md mx-auto">
        <div className="bg-ex-block rounded-2xl p-5 shadow-lg text-center">
          <p className="text-ex-error mb-4">{error}</p>
          <button
            onClick={onBack}
            className="w-full py-3 rounded-xl bg-ex-block-sm text-ex-text-sec font-medium text-sm
                       border border-ex-divider active:scale-[0.98] transition-transform"
          >
            {t("back_button")}
          </button>
        </div>
      </div>
    );
  }

  const requiredVisible = visibleFields.filter((f) => f.req);
  const optionalVisible = visibleFields.filter((f) => !f.req);

  return (
    <div className="min-h-screen flex flex-col justify-center px-4 py-6 max-w-md mx-auto">
      <h1 className="font-secondary text-xl font-bold text-center text-ex-accent mb-8 tracking-wide">
        SAPSANEX
      </h1>

      <div className="bg-ex-block rounded-2xl p-5 shadow-lg">
        <h2 className="text-lg font-semibold text-ex-text text-center mb-1">
          {t("fields_title")}
        </h2>
        <p className="text-xs text-ex-text-sec text-center mb-5">
          {currencyGive} → {currencyGet}
        </p>

        {/* Required fields */}
        {requiredVisible.map((field) => renderFieldInput(field, true))}

        {/* Optional fields */}
        {optionalVisible.length > 0 && (
          <>
            {requiredVisible.length > 0 && (
              <div className="border-t border-ex-divider my-4" />
            )}
            <p className="text-xs text-ex-text-sec mb-3">{t("optional_fields")}</p>
            {optionalVisible.map((field) => renderFieldInput(field, false))}
          </>
        )}

        {/* Server/submit error */}
        {submitError && (
          <p className="text-sm text-ex-error text-center mt-3 mb-1">{submitError}</p>
        )}

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={!allRequiredFilled}
          className={`w-full mt-4 py-4 rounded-xl font-semibold text-base
                     active:scale-[0.98] transition-all shadow-md font-primary
                     ${allRequiredFilled
                       ? "bg-ex-accent text-ex-block-sm"
                       : "bg-ex-block-sm text-ex-text-sec cursor-not-allowed opacity-50"
                     }`}
        >
          {t("save_button")}
        </button>

        <button
          onClick={onBack}
          className="w-full mt-3 py-3 rounded-xl bg-ex-block-sm text-ex-text-sec font-medium text-sm
                     border border-ex-divider active:scale-[0.98] transition-transform"
        >
          {t("back_button")}
        </button>
      </div>
    </div>
  );
}
