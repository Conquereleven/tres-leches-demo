import type { Resource } from "i18next";
import enCommon from "./en/common.json";
import enNavigation from "./en/navigation.json";
import enHome from "./en/home.json";
import enMenu from "./en/menu.json";
import enProduct from "./en/product.json";
import enCheckout from "./en/checkout.json";
import enPolicies from "./en/policies.json";
import esCommon from "./es/common.json";
import esNavigation from "./es/navigation.json";
import esHome from "./es/home.json";
import esMenu from "./es/menu.json";
import esProduct from "./es/product.json";
import esCheckout from "./es/checkout.json";
import esPolicies from "./es/policies.json";
import arCommon from "./ar/common.json";
import arNavigation from "./ar/navigation.json";
import arHome from "./ar/home.json";
import arMenu from "./ar/menu.json";
import arProduct from "./ar/product.json";
import arCheckout from "./ar/checkout.json";
import arPolicies from "./ar/policies.json";
export const localeResources = {
  en: {
    common: enCommon,
    navigation: enNavigation,
    home: enHome,
    menu: enMenu,
    product: enProduct,
    checkout: enCheckout,
    policies: enPolicies,
  },
  es: {
    common: esCommon,
    navigation: esNavigation,
    home: esHome,
    menu: esMenu,
    product: esProduct,
    checkout: esCheckout,
    policies: esPolicies,
  },
  ar: {
    common: arCommon,
    navigation: arNavigation,
    home: arHome,
    menu: arMenu,
    product: arProduct,
    checkout: arCheckout,
    policies: arPolicies,
  },
};
/** Missing translations stay outside the engine; the release audit treats them as blockers. */
export const resources: Resource = Object.fromEntries(
  Object.entries(localeResources).map(([locale, namespaces]) => [
    locale,
    Object.fromEntries(
      Object.entries(namespaces).map(([namespace, entries]) => [
        namespace,
        Object.fromEntries(
          Object.entries(entries).filter(([, value]) => value !== null),
        ),
      ]),
    ),
  ]),
);
