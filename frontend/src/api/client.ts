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

  getTranslations(language: string) {
    return request<import("../types").Translations>(`/translations/${language}`);
  },
};
