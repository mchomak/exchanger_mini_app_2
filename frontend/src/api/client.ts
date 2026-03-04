/**
 * API client for backend communication.
 */

const API_BASE = "/api";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || error.detail?.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  initUser(initData: string) {
    return request<import("../types").UserData>("/users/init", {
      method: "POST",
      body: JSON.stringify({ init_data: initData }),
    });
  },

  getDirections() {
    return request<import("../types").Direction[]>("/exchange/directions");
  },

  calculate(directionId: string, amount: number, calcAction: string = "give") {
    return request<import("../types").CalcResult>("/exchange/calculate", {
      method: "POST",
      body: JSON.stringify({
        direction_id: directionId,
        amount,
        calc_action: calcAction,
      }),
    });
  },

  getDirectionFields(directionId: string) {
    return request<import("../types").DirectionFieldsResponse>(
      `/exchange/direction/${directionId}/fields`
    );
  },

  saveUserProfile(telegramId: number, fullName: string | null, email: string | null, phone: string | null) {
    return request<{ ok: boolean }>("/users/profile/save", {
      method: "POST",
      body: JSON.stringify({
        telegram_id: telegramId,
        full_name: fullName,
        email,
        phone,
      }),
    });
  },

  createOrder(directionId: string, amount: number, fields: Record<string, string>, userTelegramId: number) {
    return request<import("../types").OrderData>("/exchange/create", {
      method: "POST",
      body: JSON.stringify({
        direction_id: directionId,
        amount,
        fields,
        user_telegram_id: userTelegramId,
      }),
    });
  },

  getOrderStatus(hash: string) {
    return request<import("../types").OrderData>(`/exchange/${hash}/status`);
  },

  getTranslations(language: string) {
    return request<import("../types").Translations>(`/translations/${language}`);
  },

  // Exchange History
  getExchangeHistory(telegramId: number) {
    return request<import("../types").ExchangeHistoryItem[]>(`/exchange/history/${telegramId}`);
  },

  // User Accounts
  getUserAccounts(telegramId: number) {
    return request<import("../types").UserAccounts>(`/users/${telegramId}/accounts`);
  },

  // Cards CRUD
  addCard(telegramId: number, cardNumber: string, label?: string) {
    return request<import("../types").UserCardItem>(`/users/${telegramId}/cards`, {
      method: "POST",
      body: JSON.stringify({ card_number: cardNumber, label: label || null }),
    });
  },
  updateCard(telegramId: number, cardId: number, data: { card_number?: string; label?: string }) {
    return request<import("../types").UserCardItem>(`/users/${telegramId}/cards/${cardId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  deleteCard(telegramId: number, cardId: number) {
    return request<{ ok: boolean }>(`/users/${telegramId}/cards/${cardId}`, { method: "DELETE" });
  },

  // Wallets CRUD
  addWallet(telegramId: number, address: string, label?: string) {
    return request<import("../types").UserWalletItem>(`/users/${telegramId}/wallets`, {
      method: "POST",
      body: JSON.stringify({ address, label: label || null }),
    });
  },
  updateWallet(telegramId: number, walletId: number, data: { address?: string; label?: string }) {
    return request<import("../types").UserWalletItem>(`/users/${telegramId}/wallets/${walletId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  deleteWallet(telegramId: number, walletId: number) {
    return request<{ ok: boolean }>(`/users/${telegramId}/wallets/${walletId}`, { method: "DELETE" });
  },

  // Phones CRUD
  addPhone(telegramId: number, phoneNumber: string, label?: string) {
    return request<import("../types").UserPhoneItem>(`/users/${telegramId}/phones`, {
      method: "POST",
      body: JSON.stringify({ phone_number: phoneNumber, label: label || null }),
    });
  },
  updatePhone(telegramId: number, phoneId: number, data: { phone_number?: string; label?: string }) {
    return request<import("../types").UserPhoneItem>(`/users/${telegramId}/phones/${phoneId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  deletePhone(telegramId: number, phoneId: number) {
    return request<{ ok: boolean }>(`/users/${telegramId}/phones/${phoneId}`, { method: "DELETE" });
  },
};
