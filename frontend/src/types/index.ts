export interface Direction {
  direction_id: string;
  currency_give_id: string;
  currency_give_title: string;
  currency_get_id: string;
  currency_get_title: string;
}

export interface CalcResult {
  sum_give: string;
  sum_give_com: string;
  sum_get: string;
  sum_get_com: string;
  currency_give: string;
  currency_get: string;
  course_give: string;
  course_get: string;
  reserve: string;
  min_give: string;
  max_give: string;
  min_get: string;
  max_get: string;
  changed: boolean;
}

export interface UserData {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string;
  settings: UserSettings | null;
}

export interface UserSettings {
  default_currency_give: string;
  default_currency_get: string;
  notifications_enabled: boolean;
  language: string;
}

export interface OrderData {
  id: string;
  hash: string;
  url: string;
  status: string;
  status_title: string;
  amount_give: string;
  amount_get: string;
  currency_give: string;
  currency_get: string;
  can_pay_via_api: boolean;
  can_cancel: boolean;
  payment_url: string | null;
  payment_type: string;
}

export type Translations = Record<string, string>;
