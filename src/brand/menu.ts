import data from "./menu-data.json";

export type MenuOption = {
  id: string;
  variant: string;
  size: string;
  priceFils: number;
};
export type MenuFamily = {
  id: string;
  category: string;
  name: string;
  options: MenuOption[];
  image: string | null;
  advanceOrder: boolean;
  source: string;
  pack: boolean;
};
export const menuFamilies: MenuFamily[] = data.families.map((f) => ({
  ...f,
  options: [...f.options].sort(
    (a, b) => b.priceFils - a.priceFils || a.id.localeCompare(b.id),
  ),
}));
export const menuCategories = data.categories;
export const menuFamilyForSku = (id: string) =>
  currentMenu().families.find((family) =>
    family.options.some((option) => option.id === id),
  );

/** A changed flavour keeps the selected size, never creates an unsupported SKU. */
export function selectMenuOption(
  family: MenuFamily,
  variant: string,
  size: string,
): MenuOption {
  const option = family.options.find(
    (option) => option.variant === variant && option.size === size,
  );
  if (!option) throw new Error("Unsupported menu option");
  return option;
}

// Authored immutable identities; never derive URLs from mutable display names at runtime.
import products from "../../shared/storefront-products.json";
export const storefrontProducts = products;
export type StorefrontProduct = (typeof products)[number] & {
  description?: string | null;
};
export function productFamily(product: StorefrontProduct): MenuFamily {
  const family = menuFamilies.find((f) => f.id === product.familyId)!;
  return {
    ...family,
    options: family.options.filter((o) => product.optionIds.includes(o.id)),
  };
}
export const productHref = (product: StorefrontProduct) =>
  `/menu?product=${encodeURIComponent(product.slug)}`;

export const storefrontProductForSku = (sku: string) =>
  currentMenu().products.find((p) => p.optionIds.includes(sku));

/**
 * The menu the customer sees. Without dynamic adoption it is the catalog shipped with
 * the build (the constants above). With it, it is the published revision: products,
 * categories, variants, prices and availability come from the server, and nothing is
 * shown while no valid revision is available.
 */
import {
  liveState,
  useLiveCatalog,
  type LiveCatalog,
  type LiveState,
} from "./live-catalog";
export type Menu = {
  status: LiveState["status"];
  categories: { id: string; name: string }[];
  products: StorefrontProduct[];
  families: MenuFamily[];
};
const bundledMenu: Menu = {
  status: "bundled",
  categories: menuCategories,
  products: storefrontProducts,
  families: menuFamilies,
};
const emptyMenu = (status: "loading" | "unavailable"): Menu => ({
  status,
  categories: [],
  products: [],
  families: [],
});
const pending = {
  loading: emptyMenu("loading"),
  unavailable: emptyMenu("unavailable"),
};
function fromLive(catalog: LiveCatalog): Menu {
  const authored = new Map(storefrontProducts.map((p) => [p.id, p]));
  const products = catalog.products.map((p) => ({
    id: p.id,
    slug: p.slug,
    familyId: p.familyId,
    title: p.content.en.name ?? p.id,
    description: p.content.en.description,
    // Existing products keep their authored variant: it selects approved photography.
    variant: authored.get(p.id)?.variant ?? p.options[0]?.flavor ?? "",
    optionIds: p.options.map((o) => o.id),
  })) as StorefrontProduct[];
  const families = catalog.families.map((f) => {
    const known = menuFamilies.find((x) => x.id === f.id);
    return {
      id: f.id,
      category: f.categoryId,
      name: f.name,
      image: known?.image ?? null,
      advanceOrder: f.advanceOrder,
      source: known?.source ?? "",
      pack: f.pack,
      options: catalog.products
        .filter((p) => p.familyId === f.id)
        .flatMap((p) => p.options)
        .map((o) => ({
          id: o.id,
          variant: o.flavor ?? "",
          size: o.size ?? "",
          priceFils: o.priceFils,
        }))
        .sort((a, b) => b.priceFils - a.priceFils || a.id.localeCompare(b.id)),
    };
  });
  return {
    status: "live",
    categories: catalog.categories.map((c) => ({ id: c.id, name: c.name })),
    products,
    families,
  };
}
let adapted: { catalog: LiveCatalog; menu: Menu } | null = null;
function menuFor(state: LiveState): Menu {
  if (state.status === "bundled") return bundledMenu;
  if (state.status !== "live") return pending[state.status];
  if (adapted?.catalog !== state.catalog)
    adapted = { catalog: state.catalog, menu: fromLive(state.catalog) };
  return adapted.menu;
}
export const currentMenu = () => menuFor(liveState());
export const useMenu = () => menuFor(useLiveCatalog());
export function menuProductFamily(menu: Menu, product: StorefrontProduct) {
  const family = menu.families.find((f) => f.id === product.familyId)!;
  return {
    ...family,
    options: family.options.filter((o) => product.optionIds.includes(o.id)),
  };
}
