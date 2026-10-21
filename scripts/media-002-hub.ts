/**
 * 3L-MEDIA-002: stage the reviewed product photographs as a private Product Hub draft.
 *
 *   HUB_BASE=https://… HUB_COOKIE='tl_session=…' node --import tsx scripts/media-002-hub.ts [--draft]
 *   (HUB_PLAN=<file> only for an isolated rehearsal against a fixture revision)
 *
 * Default is a read-only dry run: it checks the published revision, that every
 * product still has the media recorded in the plan, and prints the change.
 * `--draft` uploads the photographs and saves each product with only `media`
 * changed, through the same API the editor uses. It never publishes: an
 * administrator reviews the draft comparison in Operations → Products and
 * publishes there. Every other product and variant field is copied unchanged
 * from the Product Hub view, and the script stops if the saved draft differs
 * from the live product in anything but media.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

type Link = { assetId: string; role: "primary" | "gallery"; order: number };
type Plan = {
  expectedPublishedRevision: string;
  products: {
    productId: string;
    alt: Record<"en" | "es" | "ar", { name: string | null }>;
    before: Link[];
    uploads: { file: string; sha256: string; role: "primary" | "gallery" }[];
    retainPrevious: string[];
  }[];
};
type HubProduct = Record<string, unknown> & {
  id: string;
  media: Link[];
  variants: (Record<string, unknown> & { skuId: string })[];
};
type HubView = {
  available: boolean;
  version: number;
  published: { id: string };
  draft: unknown;
  products: HubProduct[];
  assets: { id: string; version: string }[];
};

const docs = join(process.cwd(), "docs/media/3l-media-002");
// HUB_PLAN lets an isolated rehearsal use a plan recorded against its own fixture revision.
const plan = JSON.parse(
  readFileSync(
    process.env.HUB_PLAN ?? join(docs, "publication-plan.json"),
    "utf8",
  ),
) as Plan;
const base = process.env.HUB_BASE ?? "";
const cookie = process.env.HUB_COOKIE ?? "";
const write = process.argv.includes("--draft");
if (!/^https?:\/\//.test(base) || !cookie)
  throw new Error("HUB_BASE and HUB_COOKIE are required");
const origin = new URL(base).origin;

const view = async () => {
  const res = await fetch(`${base}/api/product-hub`, {
    headers: { Cookie: cookie },
  });
  if (!res.ok) throw new Error(`Product Hub view: HTTP ${res.status}`);
  return (await res.json()) as HubView;
};
const sameLinks = (a: Link[], b: Link[]) =>
  JSON.stringify([...a].sort((x, y) => x.assetId.localeCompare(y.assetId))) ===
  JSON.stringify([...b].sort((x, y) => x.assetId.localeCompare(y.assetId)));
/** Same order the editor uses: primary first, then gallery in sequence. */
const ordered = (ids: string[]): Link[] =>
  ids.map((assetId, i) => ({
    assetId,
    role: i === 0 ? "primary" : "gallery",
    order: i === 0 ? 0 : i - 1,
  }));
/** Every saved product and variant field except product media, for the safety comparison. */
const PRODUCT_FIELDS = [
  "id",
  "slug",
  "familyId",
  "categoryId",
  "name",
  "description",
  "commercialState",
  "translations",
];
const VARIANT_FIELDS = [
  "skuId",
  "flavor",
  "size",
  "packQuantity",
  "commercialState",
  "translations",
  "media",
  "catalogName",
  "operationsName",
  "priceFils",
  "active",
  "availability",
];
const differences = (a: HubProduct, b: HubProduct) => {
  const out = PRODUCT_FIELDS.filter(
    (k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]),
  );
  if (a.variants.length !== b.variants.length) out.push("variants");
  a.variants.forEach((v, i) => {
    for (const k of VARIANT_FIELDS)
      if (
        JSON.stringify(v[k] ?? null) !==
        JSON.stringify(b.variants[i]?.[k] ?? null)
      )
        out.push(`${v.skuId}.${k}`);
  });
  return out;
};

let hub = await view();
if (!hub.available) throw new Error("Product Hub is not available");
if (hub.published.id !== plan.expectedPublishedRevision)
  throw new Error(
    `Published revision is ${hub.published.id}, plan expects ${plan.expectedPublishedRevision}. Re-review the plan.`,
  );
if (hub.draft && write)
  throw new Error(
    "A Product Hub draft already exists; review or discard it first",
  );
for (const item of plan.products) {
  const product = hub.products.find((p) => p.id === item.productId);
  if (!product) throw new Error(`${item.productId}: not in Product Hub`);
  if (!sameLinks(product.media, item.before))
    throw new Error(
      `${item.productId}: published media changed since the plan`,
    );
  for (const upload of item.uploads) {
    const sha = createHash("sha256")
      .update(readFileSync(join(docs, upload.file)))
      .digest("hex");
    if (sha !== upload.sha256) throw new Error(`${upload.file}: hash mismatch`);
  }
  console.log(
    `${write ? "DRAFT" : "DRY RUN"} ${item.productId}: ${item.uploads.length} new photograph(s) first, ${item.retainPrevious.length} current image(s) kept after them`,
  );
}
if (!write) process.exit(0);

for (const item of plan.products) {
  const fresh: string[] = [];
  for (const upload of item.uploads) {
    const bytes = readFileSync(join(docs, upload.file));
    const res = await fetch(`${base}/api/product-hub/media`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: origin,
        "Content-Type": "image/webp",
        "Idempotency-Key": `m002-${upload.sha256.slice(0, 40)}-v${hub.version}`,
        "X-Hub-Meta": Buffer.from(
          JSON.stringify({
            expectedVersion: hub.version,
            alt: Object.fromEntries(
              (["en", "es", "ar"] as const).map((l) => [
                l,
                {
                  name: item.alt[l].name,
                  description: null,
                  variantLabel: null,
                },
              ]),
            ),
          }),
        ).toString("base64url"),
      },
      body: bytes,
    });
    const body = (await res.json()) as { assetId?: string; version?: number };
    if (!res.ok || !body.assetId)
      throw new Error(`${upload.file}: upload HTTP ${res.status}`);
    fresh.push(body.assetId);
    hub = await view();
  }
  const product = hub.products.find((p) => p.id === item.productId)!;
  const variants = product.variants.map((v) => ({
    skuId: v.skuId,
    flavor: v.flavor,
    size: v.size,
    packQuantity: v.packQuantity,
    commercialState: v.commercialState,
    translations: v.translations,
    media: v.media,
    catalogName: v.catalogName,
    operationsName: v.operationsName ?? null,
    priceFils: v.priceFils,
    active: v.active,
    availability: v.availability,
  }));
  const res = await fetch(`${base}/api/product-hub/commands`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Content-Type": "application/json",
      "Idempotency-Key": `m002-save-v${hub.version}-${item.productId}`.slice(
        0,
        128,
      ),
    },
    body: JSON.stringify({
      type: "saveProduct",
      expectedVersion: hub.version,
      product: {
        id: product.id,
        slug: product.slug,
        familyId: product.familyId,
        categoryId: product.categoryId,
        name: product.name,
        description: product.description,
        commercialState: product.commercialState,
        translations: product.translations,
        media: ordered([...fresh, ...item.retainPrevious]),
      },
      variants,
    }),
  });
  if (!res.ok)
    throw new Error(
      `${item.productId}: save HTTP ${res.status} ${await res.text()}`,
    );
  const before = product;
  hub = await view();
  const after = hub.products.find((p) => p.id === item.productId)!;
  const changed = differences(before, after);
  if (changed.length)
    throw new Error(
      `${item.productId}: draft changed ${changed.join(", ")} — stop and discard the draft`,
    );
  console.log(`saved draft ${item.productId}: ${after.media.length} image(s)`);
}
console.log(
  "Draft ready. Review it in Operations → Products and publish only after approval.",
);
