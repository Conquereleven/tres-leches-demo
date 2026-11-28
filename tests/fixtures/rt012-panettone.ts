import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Store } from "../../server/db/store";
import type { Actor } from "../../server/domain/model";
import {
  hubCommand,
  hubUpload,
  hubView,
  type HubCommand,
  type HubFlags,
} from "../../server/catalog/product-hub";
import manifest from "../../data-imports/rt012-panettone/manifest.json";
import bolillo from "../../data-imports/commercial-hotfix/ph-media.json";
import { prepareBolilloMedia } from "../../data-imports/commercial-hotfix/prepare";

const admin: Actor = { id: "fixture-panettone-admin", role: "admin" };
const flags: HubFlags = { enabled: true, publishEnabled: true, publishBlocked: null };
const locales = ["en", "es", "ar"] as const;
type Localized = Record<(typeof locales)[number], string>;
type ProductCommand = Extract<HubCommand, { type: "saveProduct" }>;
type Content = ProductCommand["product"]["translations"];

function content(name: Localized, description?: Localized, size?: Localized, flavour?: Localized): Content {
  const entries = locales.map((locale) => [
    locale,
    {
      name: name[locale],
      description: description?.[locale] ?? null,
      variantLabel: flavour?.[locale] ?? null,
      ...(size ? { sizeLabel: size[locale] } : {}),
    },
  ]);
  return Object.fromEntries(entries) as Content;
}

export function draftPanettoneFixture(
  store: Store, { release = false, legacyAttributes = false, disabledSkus = [] as string[] } = {},
) {
  const before = store.read();
  const revision = before.catalogFoundation?.revision.id;
  assert.ok(revision);
  assert.equal(before.productHub?.draft, undefined);
  assert.ok(!before.catalog?.some((row) => row.id.startsWith("panettone-")));
  let version = before.productHub?.version ?? 0;
  const command = (raw: HubCommand) =>
    hubCommand(store, admin, randomUUID(), raw, flags);
  command({
    type: "addCategory",
    expectedVersion: version++,
    category: {
      id: "panettone",
      name: manifest.category.en,
      translations: content(manifest.category),
    },
  });
  command({
    type: "saveFamily",
    expectedVersion: version++,
    family: {
      id: "panettone",
      categoryId: "panettone",
      name: manifest.category.en,
      pack: false,
      advanceOrder: false,
    },
  });
  for (const product of manifest.products) {
    const releaseAvailability = product.releaseAvailability;
    assert.equal(releaseAvailability, "unavailable");
    const availability = release ? releaseAvailability : "available";
    const photos = legacyAttributes
      ? product.galleryPhotos
      : [product.previewPhoto, ...product.galleryPhotos];
    const media = photos.map((photo, index) => {
      const bytes = readFileSync(new URL(`../../data-imports/rt012-panettone/${photo.file}`, import.meta.url));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), photo.sha256);
      const output = hubUpload(store, admin, randomUUID(), bytes, "image/webp",
        { expectedVersion: version++, alt: content(product.name) }, flags) as { assetId: string };
      return { assetId: output.assetId, role: index === 0 ? "primary" as const : "gallery" as const, order: Math.max(0, index - 1) };
    });
    command({
      type: "saveProduct",
      expectedVersion: version++,
      product: {
        id: product.id,
        slug: product.id,
        familyId: "panettone",
        categoryId: "panettone",
        name: product.name.en,
        description: product.description.en,
        commercialState: "published",
        translations: content(product.name, product.description),
        media,
      },
      variants: manifest.sizes.map((size) => {
        const name = {
          en: `${product.name.en} · ${size.en}`,
          es: `${product.name.es} · ${size.es}`,
          ar: `${product.name.ar} · ${size.ar}`,
        };
        return {
          skuId: `${product.id}-${size.id}`,
          flavor: legacyAttributes ? product.name.en : product.flavor.en,
          size: size.en,
          packQuantity: null,
          commercialState: "published",
          translations: legacyAttributes
            ? content(name, undefined, product.name, size)
            : content(name, undefined, size, product.flavor),
          media: [],
          catalogName: name.en,
          operationsName: name.en,
          priceFils: size.priceFils,
          active: true,
          availability: disabledSkus.includes(`${product.id}-${size.id}`) ? "unavailable" : availability,
        };
      }),
    });
  }
  return {
    publish: () => command({
      type: "publish",
      expectedVersion: version,
      expectedPublishedRevision: revision,
    }),
  };
}

export function publishBolilloPhotoFixture(store: Store) {
  const command = (raw: HubCommand) => hubCommand(store, admin, randomUUID(), raw, flags);
  const readHub = () => {
    const hub = hubView(store.read(), admin, flags);
    assert.ok(hub.available);
    return hub;
  };
  const publish = () => {
    const hub = readHub();
    command({ type: "publish", expectedVersion: hub.version, expectedPublishedRevision: hub.published.id });
  };
  const terms = {
    en: { name: "Mexican Bolillo", description: null, variantLabel: null },
    es: { name: "Bolillo Mexicano", description: null, variantLabel: null },
    ar: { name: null, description: null, variantLabel: null },
  };
  const initialHub = readHub();
  command({
    type: "saveProduct",
    expectedVersion: initialHub.version,
    product: { id: bolillo.productId, slug: bolillo.productId, name: "Mexican Bolillo", description: null,
      categoryId: "bakery", familyId: "bisquets", commercialState: "published", translations: terms, media: [] },
    variants: [{ skuId: bolillo.sku, catalogName: "Bolillos", operationsName: "Bolillos",
      commercialState: "published", flavor: null, size: null, packQuantity: null,
      translations: terms, media: [], priceFils: 500, active: true, availability: "available" }],
  });
  publish();
  const before = store.read();
  const hub = readHub();
  const product = hub.products.find((item) => item.id === bolillo.productId)!;
  const bytes = readFileSync(new URL(`../../data-imports/commercial-hotfix/${bolillo.file}`, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), bolillo.sha256);
  const { assetId } = hubUpload(store, admin, randomUUID(), bytes, "image/webp",
    { expectedVersion: hub.version, alt: terms }, flags) as { assetId: string };
  const uploaded = readHub();
  const delta = prepareBolilloMedia(product, uploaded.version, assetId);
  command(delta);
  const draft = readHub();
  assert.deepEqual(draft.changes.map(({ kind, field }) => [kind, field]).sort(),
    [["asset", "created"], ["product", "media"]]);
  publish();
  return { before, after: store.read(), product, assetId };
}
