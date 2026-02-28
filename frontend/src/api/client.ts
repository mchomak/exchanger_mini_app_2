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

  saveUserProfile(telegramId: number, fullName: string | null, email: string | null) {
    return request<{ ok: boolean }>("/users/profile/save", {
      method: "POST",
      body: JSON.stringify({
        telegram_id: telegramId,
        full_name: fullName,
        email,
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
};
