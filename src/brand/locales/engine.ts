import { createInstance } from "i18next";
import { resources } from "./resources";
import index from "./source-index.json";
export const supportedLocales = ["en", "es", "ar"] as const;
export type Locale = (typeof supportedLocales)[number];
export function isLocale(value: unknown): value is Locale {
  return supportedLocales.some((locale) => locale === value);
}
export const storefrontI18n = createInstance();
void storefrontI18n.init({
  lng: "en",
  supportedLngs: [...supportedLocales],
  fallbackLng: false,
  resources,
  ns: Object.keys(resources.en!),
  defaultNS: "common",
  initAsync: false,
  returnNull: false,
  interpolation: { escapeValue: false, prefix: "{", suffix: "}" },
});
const sourceIndex: Record<string, string> = index;
const missingLabels = {
  en: "Translation pending",
  es: "Traducción pendiente",
  ar: "الترجمة قيد الإعداد",
};
export function localizedKey(
  key: string,
  locale: Locale,
  values: Record<string, string | number> = {},
): string {
  if (!storefrontI18n.exists(key, { lng: locale }))
    return missingLabels[locale];
  return String(storefrontI18n.t(key, { lng: locale, ...values }));
}
/** Compatibility boundary for existing copy nodes; new UI should use explicit keys + values. */
export function localizedSource(source: string, locale: Locale): string {
  if (locale === "en" || !source.trim()) return source;
  const key = sourceIndex[source];
  if (key) return localizedKey(key, locale);
  // Existing dynamic nodes are matched only against inventoried copy templates.
  for (const [template, templateKey] of Object.entries(sourceIndex)) {
    if (!template.includes("{0}")) continue;
    const tokens = [...template.matchAll(/\{(\d+)\}/g)].map(
      (match) => match[1]!,
    );
    const pattern = template
      .split(/\{\d+\}/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("(.+?)");
    const match = new RegExp(`^${pattern}$`, "u").exec(source);
    if (match)
      return localizedKey(
        templateKey,
        locale,
        Object.fromEntries(tokens.map((token, i) => [token, match[i + 1]!])),
      );
  }
  // Numbers/units and identifiers are data, not translated catalog records.
  if (/^[\d\s.,×·–/+()-]*(?:AED|g|kg|ml)?[\d\s.,×·–/+()-]*$/u.test(source))
    return source;
  return missingLabels[locale];
}
export function localizedMoney(priceFils: number, locale: Locale): string {
  return new Intl.NumberFormat(
    locale === "ar" ? "ar-AE" : locale === "es" ? "es-AE" : "en-AE",
    {
      style: "currency",
      currency: "AED",
      currencyDisplay: "code",
      maximumFractionDigits: 2,
    },
  ).format(priceFils / 100);
}
export function localizedDate(isoDate: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Dubai",
  }).format(new Date(`${isoDate}T12:00:00+04:00`));
}
