import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import customerCopy from "./locales/customer-copy.json";
import { I18nextProvider } from "react-i18next";
import {
  isLocale,
  localizedSource,
  storefrontI18n,
  type Locale,
} from "./locales/engine";
export type { Locale } from "./locales/engine";
export const english = {
  menu: "Menu",
  cart: "Cart",
  contact: "Contact",
  story: "Our story",
  how: "How to order",
  language: "Language",
};
// Existing approved general navigation only; all other copy stays English until reviewed.
export const arabic: Partial<typeof english> = {
  menu: "القائمة",
  cart: "السلة",
  contact: "تواصل معنا",
  story: "قصتنا",
  how: "كيفية الطلب",
  language: "اللغة",
};

export function initialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const url = new URL(window.location.href);
  const query = url.searchParams.get("lang");
  if (isLocale(query)) return query;
  try {
    const stored = localStorage.getItem("3l-language");
    return isLocale(stored) ? stored : "en";
  } catch {
    return "en";
  }
}
type CopyResources = Record<string, { english: string; arabic: string | null }>;
/** Approved resources only. Preserve English and interpolated values when input is incomplete. */
export function translatedCopy(
  source: string,
  locale: Locale,
  resources: CopyResources = customerCopy,
): string {
  if (resources === customerCopy) return localizedSource(source, locale);
  if (locale !== "ar") return source;
  const exact = resources[source]?.arabic;
  if (exact) return exact;
  for (const [key, entry] of Object.entries(resources)) {
    if (!entry.arabic || !key.includes("{0}")) continue;
    const tokens = [...key.matchAll(/\{(\d+)\}/g)].map((match) => match[1]!);
    const translatedTokens = [...entry.arabic.matchAll(/\{(\d+)\}/g)].map(
      (match) => match[1]!,
    );
    if (
      new Set(tokens).size !== new Set(translatedTokens).size ||
      tokens.some((token) => !translatedTokens.includes(token))
    )
      continue;
    const escape = (value: string) =>
      value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = key
      .split(/\{\d+\}/)
      .map(escape)
      .join("(.*?)");
    const match = new RegExp("^" + pattern + "$", "u").exec(source);
    if (!match) continue;
    const values = new Map(
      tokens.map((token, index) => [token, match[index + 1]!]),
    );
    return entry.arabic.replace(/\{(\d+)\}/g, (_, token: string) =>
      values.get(token)!,
    );
  }
  return source;
}

const Context = createContext({
  language: "en" as Locale,
  setLanguage: (_value: Locale) => {},
  t: (key: keyof typeof english): string => english[key],
  text: (source: string): string => source,
});
export function LocalizationProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Locale>(initialLocale);
  useEffect(() => {
    void storefrontI18n.changeLanguage(language);
    const publicPage = !location.pathname.startsWith("/operations");
    document.documentElement.lang = publicPage ? language : "en";
    document.documentElement.dir =
      publicPage && language === "ar" ? "rtl" : "ltr";
    try {
      localStorage.setItem("3l-language", language);
    } catch {
      /* Optional persistence. */
    }
  }, [language]);
  const change = (next: Locale) => {
    const url = new URL(location.href);
    url.searchParams.set("lang", next);
    history.replaceState(history.state, "", url);
    void storefrontI18n.changeLanguage(next);
    setLanguage(next);
  };
  return (
    <I18nextProvider i18n={storefrontI18n}>
      <Context.Provider
        value={{
          language,
          setLanguage: change,
          t: (key) => localizedSource(english[key], language),
          text: (source) => translatedCopy(source, language),
        }}
      >
        {children}
      </Context.Provider>
    </I18nextProvider>
  );
}
export const useLanguage = () => useContext(Context);
/** Text-node boundary: unapproved translations preserve the exact English source. */
export function CustomerCopy({ children }: { children: string }) {
  const { text } = useLanguage();
  const value = text(children);
  return <>{value}</>;
}
export function LanguageSwitcher() {
  const { language, setLanguage, text } = useLanguage();
  return (
    <label className="b-language-control">
      <span className="b-visually-hidden">{text("Language")}</span>
      <select
        className="b-language"
        aria-label={text("Change language")}
        value={language}
        onChange={(event) => {
          if (isLocale(event.target.value)) setLanguage(event.target.value);
        }}
      >
        <option value="en" lang="en">
          EN
        </option>
        <option value="es" lang="es">
          ES
        </option>
        <option value="ar" lang="ar">
          العربية
        </option>
      </select>
    </label>
  );
}
