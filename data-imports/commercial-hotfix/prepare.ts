import assert from "node:assert/strict";
import type { HubCommand, hubView } from "../../server/catalog/product-hub";
import manifest from "../rt012-panettone/manifest.json";
import bolillo from "./ph-media.json";

type EditableHub = Extract<ReturnType<typeof hubView>, { available: true }>;
type SaveProduct = Extract<HubCommand, { type: "saveProduct" }>;
type CurrentProduct = EditableHub["products"][number];

function saveProduct(current: CurrentProduct, expectedVersion: number): SaveProduct {
  return {
    type: "saveProduct",
    expectedVersion,
    product: {
      id: current.id,
      slug: current.slug,
      familyId: current.familyId!,
      categoryId: current.categoryId!,
      name: current.name,
      description: current.description,
      commercialState: current.commercialState,
      translations: current.translations,
      media: current.media,
    },
    variants: current.variants.map((variant) => ({
      skuId: variant.skuId,
      flavor: variant.flavor,
      size: variant.size,
      packQuantity: variant.packQuantity,
      commercialState: variant.commercialState,
      translations: variant.translations,
      media: variant.media,
      operationsName: variant.operationsName,
      catalogName: variant.catalogName,
      priceFils: variant.priceFils,
      active: variant.active,
      availability: variant.availability,
    })),
  };
}

export function preparePanettoneHotfix(
  current: CurrentProduct,
  expectedVersion: number,
  primaryAssetId: string,
): SaveProduct {
  const approved = manifest.products.find((product) => product.id === current.id);
  assert.ok(approved && current.categoryId === "panettone" && current.familyId === "panettone");
  assert.equal(current.variants.length, manifest.sizes.length);
  const primary = current.media.find((link) => link.role === "primary");
  assert.ok(primary, "The current primary must be reviewed before reassigning it");

  const command = saveProduct(current, expectedVersion);
  command.product.media = current.media.map((link) =>
    link === primary ? { ...link, assetId: primaryAssetId } : link);
  for (const size of manifest.sizes) {
    const skuId = `${current.id}-${size.id}`;
    const variant = command.variants.find((entry) => entry.skuId === skuId);
    assert.ok(variant && variant.size === size.en, `Review the current size for ${skuId}`);
    variant.flavor = approved.flavor.en;
    variant.translations = {
      en: { ...variant.translations.en, variantLabel: approved.flavor.en, sizeLabel: size.en },
      es: { ...variant.translations.es, variantLabel: approved.flavor.es, sizeLabel: size.es },
      ar: { ...variant.translations.ar, variantLabel: approved.flavor.ar, sizeLabel: size.ar },
    };
  }
  return command;
}

export function prepareBolilloMedia(
  current: CurrentProduct,
  expectedVersion: number,
  assetId: string,
): SaveProduct {
  assert.equal(current.id, bolillo.productId);
  assert.equal(current.categoryId, "bakery");
  assert.equal(current.familyId, "bisquets");
  assert.deepEqual(current.variants.map((variant) => variant.skuId), [bolillo.sku]);
  assert.ok(current.variants.every((variant) => variant.flavor === null && variant.size === null));
  const command = saveProduct(current, expectedVersion);
  const media = command.product.media;
  if (media.some((link) => link.assetId === assetId)) return command;
  const role = media.some((link) => link.role === "primary") ? "gallery" : "primary";
  const order = Math.max(-1, ...media.filter((link) => link.role === role).map((link) => link.order)) + 1;
  command.product.media = [...media, { assetId, role, order }];
  return command;
}
