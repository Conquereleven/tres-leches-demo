import test from "node:test";
import assert from "node:assert/strict";
import {
  isLocale,
  localizedSource,
  localizedMoney,
  localizedDate,
  storefrontI18n,
} from "../../src/brand/locales/engine";
import { localeResources } from "../../src/brand/locales/resources";
import index from "../../src/brand/locales/source-index.json";
test("customer languages use canonical identifiers and i18next without English fallback", () => {
  assert.equal(isLocale("es"), true);
  assert.equal(isLocale("ar"), true);
  assert.equal(isLocale("fr"), false);
  assert.equal(storefrontI18n.options.fallbackLng, false);
  assert.equal(localizedSource("Menu", "es"), "Menú");
  assert.equal(localizedSource("Cart", "ar"), "السلة");
});
test("minimum-order interpolation preserves amounts and canonical community names", () => {
  const source =
    "The minimum order for JVC is AED 100. Add AED 12 more to continue.";
  assert.equal(
    localizedSource(source, "es"),
    "El pedido mínimo para JVC es de AED 100. Añade AED 12 más para continuar.",
  );
  assert.equal(
    localizedSource(source, "ar"),
    "الحد الأدنى للطلب في JVC هو AED 100. أضف AED 12 للمتابعة.",
  );
});
test("presentation localizes money and dates without changing canonical financial data", () => {
  for (const locale of ["en", "es", "ar"] as const) {
    assert.equal(typeof localizedMoney(10800, locale), "string");
    assert.equal(localizedDate("2026-10-20", locale).length > 0, true);
    assert.equal(localizedSource("Pan de Muerto", locale), "Pan de Muerto");
  }
  assert.match(localizedMoney(10800, "es"), /108/);
});
test("translation resource keys are presentation-only and shared across locales", () => {
  for (const namespace of Object.keys(
    localeResources.en,
  ) as (keyof typeof localeResources.en)[]) {
    assert.deepEqual(
      Object.keys(localeResources.es[namespace]),
      Object.keys(localeResources.en[namespace]),
    );
    assert.deepEqual(
      Object.keys(localeResources.ar[namespace]),
      Object.keys(localeResources.en[namespace]),
    );
  }
  assert.ok(Object.keys(index).length >= 574);
});
