import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "../contexts/TranslationContext";
import { api } from "../api/client";
import { Loader } from "./Loader";
import type { DirectionField } from "../types";

interface Props {
  directionId: string;
  currencyGive: string;
  currencyGet: string;
  telegramUsername: string | null;
  savedFullName: string | null;
  savedEmail: string | null;
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

function mapInputType(field: DirectionField): string {
  const l = field.label.toLowerCase();
  if (isEmailField(l)) return "email";
  if (isPhoneField(l)) return "tel";
  return "text";
}

// Validation
function validatePhone(value: string): boolean {
  if (!value.trim()) return true; // empty is handled by required check
  return /^[+]?[\d\s()-]{7,20}$/.test(value.trim());
}

function validateEmail(value: string): boolean {
  if (!value.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function FieldsForm({
  directionId,
  currencyGive,
  currencyGet,
  telegramUsername,
  savedFullName,
  savedEmail,
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

  // Load direction fields
  useEffect(() => {
    setLoading(true);
    api
      .getDirectionFields(directionId)
      .then((data) => {
        const fields = [...data.required_fields, ...data.optional_fields];
        setAllFields(fields);

        // Initialize values with auto-fill
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

        // If no visible fields (all telegram-auto-filled or empty), auto-skip
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

  const handleChange = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleSubmit = async () => {
    // Validate
    const errors: Record<string, string> = {};

    for (const f of visibleFields) {
      const val = values[f.name]?.trim() || "";

      // Required check
      if (f.req && !val) {
        errors[f.name] = t("field_required");
        continue;
      }

      if (!val) continue; // optional and empty — skip validation

      // Format validation
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

    // Save ФИО and email to DB for auto-fill next time
    let fullNameToSave: string | null = null;
    let emailToSave: string | null = null;
    for (const f of allFields) {
      const val = values[f.name]?.trim() || "";
      if (isNameField(f.label) && val) fullNameToSave = val;
      if (isEmailField(f.label) && val) emailToSave = val;
    }
    if (fullNameToSave || emailToSave) {
      try {
        await api.saveUserProfile(telegramId, fullNameToSave, emailToSave);
      } catch {
        // non-critical, ignore
      }
    }

    // Build final fields dict (include telegram auto-filled)
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(values)) {
      if (val.trim()) result[key] = val.trim();
    }
    onSubmit(result);
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
        {requiredVisible.map((field) => (
          <div key={field.name} className="mb-3">
            <label className="block text-xs font-medium text-ex-text-sec mb-1.5 uppercase tracking-wider">
              {field.label} <span className="text-ex-accent">*</span>
            </label>
            <input
              type={mapInputType(field)}
              value={values[field.name] || ""}
              onChange={(e) => handleChange(field.name, e.target.value)}
              className={`w-full px-4 py-3 rounded-xl bg-ex-block-sm text-ex-text placeholder-ex-text-sec
                         text-sm border font-primary transition-colors
                         ${fieldErrors[field.name] ? "border-ex-error" : "border-ex-divider focus:border-ex-accent"}`}
              placeholder={field.label}
            />
            {fieldErrors[field.name] && (
              <p className="text-xs text-ex-error mt-1">{fieldErrors[field.name]}</p>
            )}
          </div>
        ))}

        {/* Optional fields */}
        {optionalVisible.length > 0 && (
          <>
            {requiredVisible.length > 0 && (
              <div className="border-t border-ex-divider my-4" />
            )}
            <p className="text-xs text-ex-text-sec mb-3">{t("optional_fields")}</p>
            {optionalVisible.map((field) => (
              <div key={field.name} className="mb-3">
                <label className="block text-xs font-medium text-ex-text-sec mb-1.5 uppercase tracking-wider">
                  {field.label}
                </label>
                <input
                  type={mapInputType(field)}
                  value={values[field.name] || ""}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl bg-ex-block-sm text-ex-text placeholder-ex-text-sec
                             text-sm border font-primary transition-colors
                             ${fieldErrors[field.name] ? "border-ex-error" : "border-ex-divider focus:border-ex-accent"}`}
                  placeholder={field.label}
                />
                {fieldErrors[field.name] && (
                  <p className="text-xs text-ex-error mt-1">{fieldErrors[field.name]}</p>
                )}
              </div>
            ))}
          </>
        )}

        {/* Submit button — active only when all required fields filled */}
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
