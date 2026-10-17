import type { Locale } from "./i18n";
import { en } from "./i18n/en";
import { am } from "./i18n/am";
import { om } from "./i18n/om";
import { so } from "./i18n/so";
import { ti } from "./i18n/ti";

export const messages: Record<Locale, Record<string, string>> = {
  en,
  am,
  om,
  so,
  ti,
};

export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const table = messages[locale] ?? messages.en;
  const template = table[key] ?? messages.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] != null ? String(vars[name]) : `{${name}}`,
  );
}
