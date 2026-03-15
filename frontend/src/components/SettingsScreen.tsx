import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "../contexts/TranslationContext";
import { api } from "../api/client";
import { Loader } from "./Loader";
import type { UserAccounts, UserCardItem, UserWalletItem, UserPhoneItem } from "../types";

interface Props {
  telegramId: number;
  savedFullName: string | null;
  savedEmail: string | null;
  onProfileSaved: () => void;
  onAccountsChanged?: () => void;
}

type EditingItem = {
  type: "card" | "wallet" | "phone";
  id?: number;
  value: string;
  label: string;
  network?: string;
};

const WALLET_NETWORKS = [
  { value: "btc", label: "Bitcoin (BTC)" },
  { value: "eth", label: "Ethereum (ETH / ERC20)" },
  { value: "trc20", label: "Tron (TRC20)" },
  { value: "bep20", label: "BSC (BEP20)" },
  { value: "ltc", label: "Litecoin (LTC)" },
  { value: "xrp", label: "Ripple (XRP)" },
  { value: "sol", label: "Solana (SOL)" },
  { value: "ton", label: "TON" },
  { value: "xmr", label: "Monero (XMR)" },
  { value: "polygon", label: "Polygon" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "base", label: "Base" },
  { value: "optimism", label: "Optimism" },
  { value: "avax", label: "Avalanche (AVAX)" },
];

function validateWalletAddress(addr: string, network: string): boolean {
  const a = addr.trim();
  if (!a) return false;
  if (/\s/.test(a) || /[а-яА-ЯёЁ]/.test(a)) return false;

  switch (network) {
    case "btc":
      return /^(1[1-9A-HJ-NP-Za-km-z]{25,34}|3[1-9A-HJ-NP-Za-km-z]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{25,87})$/.test(a);
    case "eth":
    case "erc20":
    case "bep20":
    case "polygon":
    case "arbitrum":
    case "base":
    case "optimism":
    case "avax":
      return /^0x[0-9a-fA-F]{40}$/.test(a);
    case "trc20":
      return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
    case "ltc":
      return /^(L[1-9A-HJ-NP-Za-km-z]{26,33}|M[1-9A-HJ-NP-Za-km-z]{26,33}|ltc1[a-zA-HJ-NP-Z0-9]{25,87})$/.test(a);
    case "xrp":
      return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(a);
    case "sol":
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
    case "ton":
      return /^(EQ|UQ)[A-Za-z0-9_-]{46,48}$/.test(a);
    case "xmr":
      return /^[48][1-9A-HJ-NP-Za-km-z]{94}$/.test(a);
    default:
      return /^[a-zA-Z0-9]{20,}$/.test(a);
  }
}

export function SettingsScreen({ telegramId, savedFullName, savedEmail, onProfileSaved, onAccountsChanged }: Props) {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState(savedFullName || "");
  const [email, setEmail] = useState(savedEmail || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");

  const [accounts, setAccounts] = useState<UserAccounts>({ cards: [], wallets: [], phones: [] });
  const [accountsLoading, setAccountsLoading] = useState(true);

  const [editing, setEditing] = useState<EditingItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const loadAccounts = useCallback(() => {
    if (!telegramId) return;
    api.getUserAccounts(telegramId).then(setAccounts).catch(() => {}).finally(() => setAccountsLoading(false));
  }, [telegramId]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileMsg("");
    try {
      await api.saveUserProfile(telegramId, fullName || null, email || null, null);
      setProfileMsg(t("settings_saved"));
      onProfileSaved();
    } catch {
      // ignore
    } finally {
      setProfileSaving(false);
    }
  };

  // CRUD handlers
  const handleSaveItem = async () => {
    if (!editing || !editing.value.trim()) return;
    setEditError("");

    // Validate wallet address if type is wallet
    if (editing.type === "wallet") {
      if (!editing.network) {
        setEditError(t("settings_network_required"));
        return;
      }
      if (!validateWalletAddress(editing.value, editing.network)) {
        setEditError(t("invalid_wallet"));
        return;
      }
    }

    setSaving(true);
    try {
      if (editing.type === "card") {
        if (editing.id) {
          await api.updateCard(telegramId, editing.id, { card_number: editing.value, label: editing.label || undefined });
        } else {
          await api.addCard(telegramId, editing.value, editing.label || undefined);
        }
      } else if (editing.type === "wallet") {
        if (editing.id) {
          await api.updateWallet(telegramId, editing.id, { address: editing.value, label: editing.label || undefined, network: editing.network });
        } else {
          await api.addWallet(telegramId, editing.value, editing.label || undefined, editing.network);
        }
      } else {
        if (editing.id) {
          await api.updatePhone(telegramId, editing.id, { phone_number: editing.value, label: editing.label || undefined });
        } else {
          await api.addPhone(telegramId, editing.value, editing.label || undefined);
        }
      }
      setEditing(null);
      setEditError("");
      loadAccounts();
      onAccountsChanged?.();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (type: "card" | "wallet" | "phone", id: number) => {
    try {
      if (type === "card") await api.deleteCard(telegramId, id);
      else if (type === "wallet") await api.deleteWallet(telegramId, id);
      else await api.deletePhone(telegramId, id);
      loadAccounts();
      onAccountsChanged?.();
    } catch {
      // ignore
    }
  };

  const inputClass =
    "w-full px-4 py-3 rounded-xl bg-ex-block-sm text-ex-text placeholder-ex-text-sec text-sm border border-ex-divider focus:border-ex-accent font-primary transition-colors";
  const btnPrimary =
    "px-4 py-2 rounded-xl bg-ex-accent text-ex-block-sm font-medium text-sm active:scale-[0.98] transition-transform";
  const btnSecondary =
    "px-4 py-2 rounded-xl bg-ex-block-sm text-ex-text-sec font-medium text-sm border border-ex-divider active:scale-[0.98] transition-transform";

  // Find existing wallet's network for editing
  const getWalletNetwork = (walletId: number): string => {
    const wallet = accounts.wallets.find((w) => w.id === walletId);
    return wallet?.network || "";
  };

  return (
    <div className="px-4 py-6 max-w-md mx-auto pb-24">
      <h1 className="font-secondary text-xl font-bold text-center text-ex-accent mb-6 tracking-wide">
        SAPSANEX
      </h1>
      <h2 className="text-lg font-semibold text-ex-text text-center mb-4">
        {t("settings_title")}
      </h2>

      {/* Profile section */}
      <div className="bg-ex-block rounded-2xl p-5 shadow-lg mb-4">
        <div className="mb-3">
          <label className="block text-xs font-medium text-ex-text-sec mb-1.5 uppercase tracking-wider">
            {t("settings_fio")}
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
            placeholder={t("settings_fio")}
          />
        </div>
        <div className="mb-3">
          <label className="block text-xs font-medium text-ex-text-sec mb-1.5 uppercase tracking-wider">
            {t("settings_email")}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder={t("settings_email")}
          />
        </div>
        <button onClick={handleSaveProfile} disabled={profileSaving} className={btnPrimary + " w-full"}>
          {profileSaving ? "..." : t("settings_save")}
        </button>
        {profileMsg && <p className="text-xs text-ex-positive text-center mt-2">{profileMsg}</p>}
      </div>

      {/* Accounts section */}
      <div className="bg-ex-block rounded-2xl p-5 shadow-lg">
        <h3 className="text-sm font-semibold text-ex-text mb-4">{t("settings_accounts_title")}</h3>

        {accountsLoading ? (
          <Loader />
        ) : (
          <>
            {/* Cards */}
            <AccountSection
              title={t("settings_cards")}
              emptyText={t("settings_empty_cards")}
              items={accounts.cards.map((c) => ({ id: c.id, value: c.card_number, label: c.label }))}
              onAdd={() => { setEditError(""); setEditing({ type: "card", value: "", label: "" }); }}
              onEdit={(item) => { setEditError(""); setEditing({ type: "card", id: item.id, value: item.value, label: item.label || "" }); }}
              onDelete={(id) => handleDelete("card", id)}
              t={t}
            />

            <div className="border-t border-ex-divider my-4" />

            {/* Wallets */}
            <AccountSection
              title={t("settings_wallets")}
              emptyText={t("settings_empty_wallets")}
              items={accounts.wallets.map((w) => ({
                id: w.id,
                value: w.address,
                label: w.label,
                badge: w.network ? WALLET_NETWORKS.find((n) => n.value === w.network)?.label || w.network : undefined,
              }))}
              onAdd={() => { setEditError(""); setEditing({ type: "wallet", value: "", label: "", network: "" }); }}
              onEdit={(item) => { setEditError(""); setEditing({ type: "wallet", id: item.id, value: item.value, label: item.label || "", network: getWalletNetwork(item.id) }); }}
              onDelete={(id) => handleDelete("wallet", id)}
              t={t}
            />

            <div className="border-t border-ex-divider my-4" />

            {/* Phones */}
            <AccountSection
              title={t("settings_phones")}
              emptyText={t("settings_empty_phones")}
              items={accounts.phones.map((p) => ({ id: p.id, value: p.phone_number, label: p.label }))}
              onAdd={() => { setEditError(""); setEditing({ type: "phone", value: "", label: "" }); }}
              onEdit={(item) => { setEditError(""); setEditing({ type: "phone", id: item.id, value: item.value, label: item.label || "" }); }}
              onDelete={(id) => handleDelete("phone", id)}
              t={t}
            />
          </>
        )}
      </div>

      {/* Edit/Add modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={() => { setEditing(null); setEditError(""); }}>
          <div
            className="bg-ex-block rounded-t-2xl w-full max-w-md p-5 pb-8 mb-14"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-ex-text mb-3">
              {editing.id ? t("settings_edit") : t("settings_add")}
            </h3>
            <div className="mb-3">
              <label className="block text-xs text-ex-text-sec mb-1">{t("settings_label")}</label>
              <input
                type="text"
                value={editing.label}
                onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                className={inputClass}
                placeholder={t("settings_label")}
              />
            </div>

            {/* Network selector for wallets */}
            {editing.type === "wallet" && (
              <div className="mb-3">
                <label className="block text-xs text-ex-text-sec mb-1">{t("settings_network")}</label>
                <select
                  value={editing.network || ""}
                  onChange={(e) => { setEditing({ ...editing, network: e.target.value }); setEditError(""); }}
                  className={inputClass}
                >
                  <option value="">{t("settings_select_network")}</option>
                  {WALLET_NETWORKS.map((n) => (
                    <option key={n.value} value={n.value}>{n.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-xs text-ex-text-sec mb-1">
                {editing.type === "card"
                  ? t("settings_card_number")
                  : editing.type === "wallet"
                  ? t("settings_wallet_address")
                  : t("settings_phone_number")}
              </label>
              <input
                type={editing.type === "phone" ? "tel" : "text"}
                value={editing.value}
                onChange={(e) => { setEditing({ ...editing, value: e.target.value }); setEditError(""); }}
                className={inputClass}
                placeholder={
                  editing.type === "card"
                    ? "0000 0000 0000 0000"
                    : editing.type === "wallet"
                    ? "0x..."
                    : "+7"
                }
              />
            </div>

            {/* Validation error */}
            {editError && (
              <p className="text-xs text-ex-error text-center mb-3">{editError}</p>
            )}

            <div className="flex gap-3">
              <button onClick={() => { setEditing(null); setEditError(""); }} className={btnSecondary + " flex-1"}>
                {t("settings_cancel")}
              </button>
              <button
                onClick={handleSaveItem}
                disabled={saving || !editing.value.trim() || (editing.type === "wallet" && !editing.network)}
                className={btnPrimary + " flex-1 disabled:opacity-50"}
              >
                {saving ? "..." : t("settings_save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-component for each account type section
function AccountSection({
  title,
  emptyText,
  items,
  onAdd,
  onEdit,
  onDelete,
  t,
}: {
  title: string;
  emptyText: string;
  items: { id: number; value: string; label: string | null; badge?: string }[];
  onAdd: () => void;
  onEdit: (item: { id: number; value: string; label: string | null }) => void;
  onDelete: (id: number) => void;
  t: (key: string) => string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-ex-text-sec uppercase tracking-wider">{title}</span>
        <button
          onClick={onAdd}
          className="text-xs text-ex-accent font-medium active:scale-[0.98] transition-transform"
        >
          + {t("settings_add")}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-ex-text-sec py-2">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between bg-ex-block-sm rounded-xl px-3 py-2.5 border border-ex-divider">
              <div className="min-w-0 flex-1">
                {item.label && <p className="text-[10px] text-ex-text-sec">{item.label}</p>}
                <p className="text-sm text-ex-text truncate">{item.value}</p>
                {item.badge && <p className="text-[10px] text-ex-accent mt-0.5">{item.badge}</p>}
              </div>
              <div className="flex gap-2 ml-2 flex-shrink-0">
                <button onClick={() => onEdit(item)} className="text-ex-accent">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button onClick={() => onDelete(item.id)} className="text-ex-error">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
