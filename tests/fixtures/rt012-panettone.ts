import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Store } from "../../server/db/store";
import type { Actor } from "../../server/domain/model";
import {
  hubCommand,
  hubUpload,
  type HubCommand,
  type HubFlags,
} from "../../server/catalog/product-hub";
import manifest from "../../data-imports/rt012-panettone/manifest.json";

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

export function draftPanettoneFixture(store: Store, { release = false } = {}) {
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
    const media = [product.previewPhoto, ...product.galleryPhotos].map((photo, index) => {
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
          flavor: product.name.en,
          size: size.en,
          packQuantity: null,
          commercialState: "published",
          translations: content(name, undefined, size, product.name),
          media: [],
          catalogName: name.en,
          operationsName: name.en,
          priceFils: size.priceFils,
          active: true,
          availability,
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
