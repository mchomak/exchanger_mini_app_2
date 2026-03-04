import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "../contexts/TranslationContext";
import { api } from "../api/client";
import { Loader } from "./Loader";
import type { DirectionField, UserCardItem, UserPhoneItem } from "../types";

interface Props {
  directionId: string;
  currencyGive: string;
  currencyGet: string;
  telegramUsername: string | null;
  savedFullName: string | null;
  savedEmail: string | null;
  savedPhone: string | null;
  savedCards: UserCardItem[];
  savedPhones: UserPhoneItem[];
  telegramId: number;
  onSubmit: (fields: Record<string, string>) => void;
  onBack: () => void;
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
  return isPhoneField(label) || isCardField(label);
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
  savedPhones,
  telegramId,
  onSubmit,
  onBack,
}: Props) {
  const { t } = useTranslation();
  const [allFields, setAllFields] = useState<DirectionField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [autoSkipped, setAutoSkipped] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

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

  const handleSelectSaved = (fieldName: string, value: string) => {
    setValues((prev) => ({ ...prev, [fieldName]: value }));
    setOpenDropdown(null);
    if (fieldErrors[fieldName]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldName];
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
    return [];
  };

  const renderFieldInput = (field: DirectionField, isRequired: boolean) => {
    const displayLabel = getDisplayLabel(field.label);
    const showDropdown = hasDropdown(field.label);
    const dropdownItems = showDropdown ? getDropdownItems(field) : [];
    const isDropdownOpen = openDropdown === field.name;
    // For renamed "На карту" → "На номер", treat as phone field for input type
    const isRenamed = displayLabel === "На номер";
    const inputType = isRenamed ? "tel" : mapInputType(field);
    const placeholder = isPhoneField(field.label) || isRenamed ? "+7" : displayLabel;

    return (
      <div key={field.name} className="mb-3">
        <label className="block text-xs font-medium text-ex-text-sec mb-1.5 uppercase tracking-wider">
          {displayLabel} {isRequired && <span className="text-ex-accent">*</span>}
        </label>
        <div className="relative">
          <input
            type={inputType}
            value={values[field.name] || ""}
            onChange={(e) => handleChange(field.name, e.target.value, isRenamed ? { ...field, label: "телефон" } : field)}
            className={`w-full px-4 py-3 rounded-xl bg-ex-block-sm text-ex-text placeholder-ex-text-sec
                       text-sm border font-primary transition-colors
                       ${fieldErrors[field.name] ? "border-ex-error" : "border-ex-divider focus:border-ex-accent"}`}
            placeholder={placeholder}
          />
          {showDropdown && dropdownItems.length > 0 && (
            <button
              type="button"
              onClick={() => setOpenDropdown(isDropdownOpen ? null : field.name)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ex-accent text-xs font-medium px-2 py-1 rounded-lg bg-ex-block-sm border border-ex-divider"
            >
              {t("field_select_saved")}
            </button>
          )}
        </div>
        {isDropdownOpen && dropdownItems.length > 0 && (
          <div className="mt-1 bg-ex-block-sm rounded-xl border border-ex-divider overflow-hidden shadow-lg">
            {dropdownItems.map((item, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectSaved(field.name, item.value)}
                className="w-full text-left px-4 py-2.5 text-sm text-ex-text hover:bg-ex-hover active:bg-ex-selected border-b border-ex-divider last:border-b-0 transition-colors"
              >
                <span className="block text-ex-text">{item.value}</span>
                {item.label !== item.value && (
                  <span className="block text-[10px] text-ex-text-sec">{item.label}</span>
                )}
              </button>
            ))}
          </div>
        )}
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
