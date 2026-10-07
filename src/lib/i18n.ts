export type Locale = "en" | "am" | "om" | "so" | "ti";

export const LOCALES: {
  id: Locale;
  label: string;
  native: string;
  intl: string;
}[] = [
  { id: "en", label: "English", native: "English", intl: "en-ET" },
  { id: "am", label: "Amharic", native: "አማርኛ", intl: "am-ET" },
  { id: "om", label: "Oromo", native: "Afaan Oromoo", intl: "om-ET" },
  { id: "so", label: "Somali", native: "Soomaali", intl: "so-ET" },
  { id: "ti", label: "Tigrinya", native: "ትግርኛ", intl: "ti-ET" },
];

const LOCALE_IDS = new Set<string>(LOCALES.map((opt) => opt.id));

const INTL_BY_LOCALE: Record<Locale, string> = Object.fromEntries(
  LOCALES.map((opt) => [opt.id, opt.intl]),
) as Record<Locale, string>;

export const LOCALE_STORAGE_KEY = "aramis-locale";

export function isLocale(value: string | null | undefined): value is Locale {
  return value != null && LOCALE_IDS.has(value);
}

export function localeIntlTag(locale: Locale): string {
  return INTL_BY_LOCALE[locale] ?? "en-ET";
}

export function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return isLocale(raw) ? raw : "en";
}

export function applyLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dataset.locale = locale;
}

export function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] != null ? String(vars[key]) : `{${key}}`,
  );
}
