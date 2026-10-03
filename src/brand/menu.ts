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
  menuFamilies.find((family) =>
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
