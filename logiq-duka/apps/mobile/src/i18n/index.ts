/**
 * Minimal i18n. LAW: every key exists in BOTH en and sw (parity enforced
 * by test/i18n-parity.test.mjs — CI fails on a missing pair).
 */
import { create } from "zustand";
import en from "./en.json";
import sw from "./sw.json";

export type Locale = "en" | "sw";
const dictionaries: Record<Locale, Record<string, string>> = { en, sw };

interface I18nState {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

export const useI18n = create<I18nState>((set) => ({
  locale: "sw", // Swahili-first (PRD §5.3 "lugha yako")
  setLocale: (locale) => set({ locale }),
}));

export function t(key: string, params?: Record<string, string | number>): string {
  const { locale } = useI18n.getState();
  let s = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}
