export type Locale = "en" | "am";

export const LOCALES: { id: Locale; label: string; native: string }[] = [
  { id: "en", label: "English", native: "English" },
  { id: "am", label: "Amharic", native: "አማርኛ" },
];

export const LOCALE_STORAGE_KEY = "aramis-locale";

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "am";
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
