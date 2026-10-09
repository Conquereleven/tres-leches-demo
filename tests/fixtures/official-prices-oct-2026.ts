/**
 * Official 3L price list for Pan de Muerto and Conchas (Joel, 9 October 2026).
 * Every row of the supplied menu, in fils, keyed by the existing SKU id.
 * Pack prices are fixed amounts, never multiples of the single price.
 */
const single = (
  prefix: string,
  variant: string,
  mini: number,
  individual: number,
  grams: boolean,
) => ({
  [`${prefix}-${variant}-mini${grams ? "-40-g" : ""}`]: mini,
  [`${prefix}-${variant}-individual${grams ? "-70-g" : ""}`]: individual,
});
const packs = (prefix: string, prices: [number, number, number, number]) => ({
  [`${prefix}-pack-6-mini`]: prices[0],
  [`${prefix}-pack-12-mini`]: prices[1],
  [`${prefix}-pack-6-individuales`]: prices[2],
  [`${prefix}-pack-12-individuales`]: prices[3],
});
const FILLINGS = [
  "crema-diplomatica-vainilla",
  "chocolate",
  "mascarpone-y-cajeta",
  "mascarpone-y-fresas",
];
export const OFFICIAL_PRICES_FILS: Record<string, number> = {
  // Pan de Muerto — traditional, sugar or sesame: mini 13, individual 15.
  ...single("pan-de-muerto-traditional", "azucar", 1300, 1500, true),
  ...single("pan-de-muerto-traditional", "ajonjoli", 1300, 1500, true),
  // The sugar bread with chocolate covering has always carried the traditional price.
  "pan-de-muerto-traditional-azucar-mini-40-g-chocolate-covering": 1300,
  "pan-de-muerto-traditional-azucar-individual-70-g-chocolate-covering": 1500,
  // Pan de Muerto — filled, standard flavours: mini 21, individual 23.
  ...Object.assign(
    {},
    ...FILLINGS.map((f) =>
      single("pan-de-muerto-filled", f, 2100, 2300, false),
    ),
  ),
  // Pan de Muerto — pistachio (confirmed by Joel): mini 23, individual 26.
  ...single("pan-de-muerto-filled", "pistachio", 2300, 2600, false),
  // Conchas — traditional: mini 13, individual 15.
  ...Object.assign(
    {},
    ...["vainilla", "chocolate", "pistache", "tricolor"].map((v) =>
      single("conchas-traditional", v, 1300, 1500, true),
    ),
  ),
  // Conchas — filled: mini 21, individual 23.
  ...Object.assign(
    {},
    ...FILLINGS.map((f) => single("conchas-filled", f, 2100, 2300, false)),
  ),
  // Packs, both categories: 6 mini, 12 mini, 6 individual, 12 individual.
  ...packs("pan-de-muerto-traditional", [7200, 14000, 8000, 15500]),
  ...packs("pan-de-muerto-filled", [12000, 23500, 13000, 25500]),
  ...packs("conchas-traditional", [7200, 14000, 8000, 15500]),
  ...packs("conchas-filled", [12000, 23500, 13000, 25500]),
};
