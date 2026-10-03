import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
export const english = {
  menu: "Menu",
  cart: "Cart",
  contact: "Contact",
  story: "Our story",
  how: "How to order",
  language: "Language",
};
// Only general navigation is translated. Business/legal/payment copy falls back explicitly.
export const arabic: Partial<typeof english> = {
  menu: "القائمة",
  cart: "السلة",
  contact: "تواصل معنا",
  story: "قصتنا",
  how: "كيفية الطلب",
  language: "اللغة",
};
const Context = createContext({
  language: "en",
  setLanguage: (_value: string) => {},
  t: (key: keyof typeof english): string => english[key],
});
export function LocalizationProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState("en");
  useEffect(() => {
    try {
      if (localStorage.getItem("3l-language") === "ar") setLanguage("ar");
    } catch {
      /* Language defaults to English when storage is unavailable. */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    try {
      localStorage.setItem("3l-language", language);
    } catch {
      /* Optional persistence. */
    }
  }, [language]);
  return (
    <Context.Provider
      value={{
        language,
        setLanguage,
        t: (key) =>
          language === "ar" ? (arabic[key] ?? english[key]) : english[key],
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useLanguage = () => useContext(Context);
export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  return (
    <button
      className="b-language"
      aria-label="Change language"
      onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
    >
      {language === "ar" ? "English" : "العربية"}
    </button>
  );
}
