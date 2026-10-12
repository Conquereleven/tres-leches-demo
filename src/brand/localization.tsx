import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import customerCopy from "./locales/customer-copy.json";
import { liveCopy, useLiveCatalog } from "./live-catalog";
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
// Canonical navigation source labels; all locale resources live in locales/.
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
/** Default resources use the strict i18next boundary; explicit fixtures retain legacy compatibility. */
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
  // Re-render translated copy when a new published revision arrives.
  useLiveCatalog();
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
          // Published catalog translations win over the build's for catalog strings.
          text: (source) =>
            liveCopy(source, language) ?? translatedCopy(source, language),
        }}
      >
        {children}
      </Context.Provider>
    </I18nextProvider>
  );
}
export const useLanguage = () => useContext(Context);
/** Text-node boundary: missing customer translations produce an explicit localized marker. */
export function CustomerCopy({ children }: { children: string }) {
  const { text } = useLanguage();
  const value = text(children);
  return <>{value}</>;
}
/**
 * Flags are a visual aid only: the written language name is always shown and
 * is what assistive technology reads. Mexico stands for Spanish on purpose —
 * 3L's heritage is Mexico City. Drawn locally so they look the same everywhere.
 */
const languages = [
  { locale: "en", name: "English" },
  { locale: "es", name: "Español" },
  { locale: "ar", name: "العربية" },
] as const;
function Flag({ locale }: { locale: Locale }) {
  return (
    <svg
      className="b-flag"
      viewBox="0 0 24 16"
      aria-hidden="true"
      focusable="false"
    >
      {locale === "en" ? (
        <>
          <rect width="24" height="16" fill="#012169" />
          <path d="M0 0L24 16M24 0L0 16" stroke="#fff" strokeWidth="3.2" />
          <path d="M0 0L24 16M24 0L0 16" stroke="#C8102E" strokeWidth="1.3" />
          <path d="M12 0V16M0 8H24" stroke="#fff" strokeWidth="5.4" />
          <path d="M12 0V16M0 8H24" stroke="#C8102E" strokeWidth="3.2" />
        </>
      ) : locale === "es" ? (
        <>
          <rect width="8" height="16" fill="#006847" />
          <rect x="8" width="8" height="16" fill="#fff" />
          <rect x="16" width="8" height="16" fill="#CE1126" />
          <ellipse cx="12" cy="8" rx="2.1" ry="2.3" fill="#8C6A3F" />
        </>
      ) : (
        <>
          <rect width="24" height="16" fill="#fff" />
          <rect x="6" width="18" height="5.34" fill="#00732F" />
          <rect x="6" y="10.66" width="18" height="5.34" fill="#000" />
          <rect width="6" height="16" fill="#FF0000" />
        </>
      )}
    </svg>
  );
}
export function LanguageSwitcher() {
  const { language, setLanguage, text } = useLanguage();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const id = useId();
  const current = languages.find((l) => l.locale === language) ?? languages[0];
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const options = () =>
    Array.from(
      root.current?.querySelectorAll<HTMLButtonElement>("[data-locale]") ?? [],
    );
  return (
    <div
      className="b-language-control"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          toggle.current?.focus();
          return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        if (!open) return setOpen(true);
        const list = options();
        const at = list.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? list.length - 1
              : (at + (event.key === "ArrowDown" ? 1 : -1) + list.length) %
                list.length;
        list[next]?.focus();
      }}
    >
      <button
        ref={toggle}
        type="button"
        className="b-language"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${text("Change language")}: ${current.name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Flag locale={current.locale} />
        <span lang={current.locale}>{current.name}</span>
        <svg className="b-language-caret" viewBox="0 0 12 8" aria-hidden="true">
          <path d="M1 1.5L6 6.5L11 1.5" fill="none" stroke="currentColor" />
        </svg>
      </button>
      <ul id={id} className="b-language-menu" hidden={!open}>
        {languages.map((option) => (
          <li key={option.locale}>
            <button
              type="button"
              data-locale={option.locale}
              lang={option.locale}
              aria-current={option.locale === language ? "true" : undefined}
              onClick={() => {
                setLanguage(option.locale);
                setOpen(false);
                toggle.current?.focus();
              }}
            >
              <Flag locale={option.locale} />
              <span>{option.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
