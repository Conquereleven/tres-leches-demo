import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import customerCopy from "./locales/customer-copy.json";
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
export type Locale = "en" | "ar";
export function initialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const url = new URL(window.location.href);
  const query = url.searchParams.get("lang");
  if (query === "en" || query === "ar") return query;
  try {
    return localStorage.getItem("3l-language") === "ar" ? "ar" : "en";
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
    setLanguage(next);
  };
  return (
    <Context.Provider
      value={{
        language,
        setLanguage: change,
        t: (key) =>
          language === "ar" ? (arabic[key] ?? english[key]) : english[key],
        text: (source) => translatedCopy(source, language),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useLanguage = () => useContext(Context);
/** Text-node boundary: unapproved translations preserve the exact English source. */
export function CustomerCopy({ children }: { children: string }) {
  const { language, text } = useLanguage();
  const value = text(children);
  // Isolate mixed-script fallback text without adding invalid markup inside options.
  return <>{language === "ar" ? `\u2068${value}\u2069` : value}</>;
}
export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  return (
    <button
      className="b-language"
      aria-label="Change language"
      lang={language === "ar" ? "en" : "ar"}
      onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
    >
      {language === "ar" ? "English" : "العربية"}
    </button>
  );
}
