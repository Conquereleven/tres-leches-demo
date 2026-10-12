import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createInstance } from "i18next";
import en from "./locales/en.json";
import tl from "./locales/tl.json";
export type OpsLanguage = "en" | "tl";
// Independent from the storefront instance: no customer language or notification changes.
const instance = createInstance();
void instance.init({
  resources: { en: { translation: en }, tl: { translation: tl } },
  lng: "en",
  fallbackLng: "en",
  initAsync: false,
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
});
export function translateOps(
  language: OpsLanguage,
  key: string,
  values?: Record<string, string | number>,
) {
  return String(
    instance.getFixedT(language)(key, { ...values, defaultValue: key }),
  );
}
export const preferenceKey = (user: string) =>
  `3l-operations-language:${encodeURIComponent(user)}`;
export function readLanguage(user: string | null): OpsLanguage {
  try {
    return user && localStorage.getItem(preferenceKey(user)) === "tl"
      ? "tl"
      : "en";
  } catch {
    return "en";
  }
}
export function formatOpsDate(
  value: string,
  language: OpsLanguage,
  time = true,
) {
  const date = new Date(
    value.length === 10 ? `${value}T12:00:00+04:00` : value,
  );
  if (!Number.isFinite(date.getTime()))
    return translateOps(language, "Sin fecha");
  return new Intl.DateTimeFormat(language === "tl" ? "fil-PH" : "en-GB", {
    timeZone: "Asia/Dubai",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(time ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
  }).format(date);
}
type Context = {
  language: OpsLanguage;
  t: typeof translate;
  formatDate: (date: string, time?: boolean) => string;
  errorText: (error: string) => string;
  setUser: (id: string | null) => void;
  setLanguage: (language: OpsLanguage, user?: string) => void;
};
const translate = (key: string, values?: Record<string, string | number>) =>
  translateOps("en", key, values);
const OpsContext = createContext<Context>({
  language: "en",
  t: translate,
  formatDate: (date, time) => formatOpsDate(date, "en", time),
  errorText: (error) => localizeOpsError("en", error),
  setUser: () => {},
  setLanguage: () => {},
});
export function OpsProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<{
    user: string | null;
    language: OpsLanguage;
  }>({ user: null, language: "en" });
  const value = useMemo<Context>(
    () => ({
      language: preference.language,
      t: (key, values) => translateOps(preference.language, key, values),
      formatDate: (date, time) =>
        formatOpsDate(date, preference.language, time),
      errorText: (error) => localizeOpsError(preference.language, error),
      setUser: (user) =>
        setPreference((previous) =>
          previous.user === user
            ? previous
            : { user, language: readLanguage(user) },
        ),
      setLanguage: (language, user) => {
        const owner = user ?? preference.user;
        if (owner) {
          try {
            localStorage.setItem(preferenceKey(owner), language);
          } catch {
            /* Optional local preference. */
          }
        }
        setPreference((previous) => ({
          user: owner ?? previous.user,
          language,
        }));
      },
    }),
    [preference],
  );
  return <OpsContext.Provider value={value}>{children}</OpsContext.Provider>;
}
export const useOps = () => useContext(OpsContext);

export function localizeOpsError(language: OpsLanguage, error: string) {
  return translateOps(
    language,
    Object.hasOwn(en, error)
      ? error
      : "Unable to complete this action. Refresh and try again.",
  );
}
