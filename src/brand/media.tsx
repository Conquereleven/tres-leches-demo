import { CustomerCopy } from "./localization";
import { useLanguage as useCustomerLanguage } from "./localization";
import manifest from "./media-manifest.json";
import categories from "./category-media.json";
import official from "./official-pan-media.json";
import { useEffect, useRef, useState } from "react";
import { liveState, useLiveCatalog, type LiveAsset } from "./live-catalog";
export const productMediaAssignments = [
  ...official.products,
  ...manifest.products,
];
export const approvedMedia = [
  ...official.assets,
  ...manifest.assets,
  ...categories.assets,
].filter((a) => a.status === "assigned");
export function selectedMedia(family: string, variant: string, size?: string) {
  return approvedMedia.find(
    (a) =>
      a.family === family &&
      a.variant === variant &&
      (!a.size || a.size === size),
  );
}
function authoredProductMedia(
  productId: string | undefined,
  family: string,
  variant: string,
  size?: string,
) {
  const primary = productMediaAssignments.find(
    (p) => p.productId === productId,
  )?.primarySourceId;
  return (
    approvedMedia.find(
      (a) => a.sourceId === primary && (!a.size || a.size === size),
    ) ?? selectedMedia(family, variant, size)
  );
}
type MediaAsset = (typeof approvedMedia)[number];
/**
 * null means bundled mode; [] means the published product explicitly has no media.
 * Product assignments (including removals) are authoritative. Variant/category
 * images are not an implicit fallback for a removed product photograph.
 */
function publishedProductMedia(
  productId: string | undefined,
  family: string,
  variant: string,
): MediaAsset[] | null {
  const state = liveState();
  if (state.status === "bundled") return null;
  if (state.status !== "live") return [];
  const { catalog } = state;
  const product = catalog.products.find((p) => p.id === productId);
  if (!product) return [];
  return [...product.media]
    .sort(
      (a, b) =>
        Number(b.role === "primary") - Number(a.role === "primary") ||
        a.order - b.order ||
        a.assetId.localeCompare(b.assetId),
    )
    .flatMap((link) => {
      const asset: LiveAsset | undefined = catalog.assets.find(
        (a) => a.id === link.assetId,
      );
      if (!asset?.derivatives.length) return [];
      const sources = new Set(asset.derivatives.map((d) => d.src));
      const known = approvedMedia.find((m) =>
        m.derivatives.some((d) => sources.has(d.src)),
      );
      const main = asset.derivatives[0]!;
      // Keep approved presentation metadata, but never expand published links
      // back into an authored gallery or replace published derivative URLs.
      return [
        {
          ...known,
          sourceId: `published-${asset.id}-${asset.version}`,
          authoredSourceId: known?.sourceId,
          status: "assigned",
          family,
          variant,
          alt: asset.alt.en.name ?? "",
          width: main.width,
          height: main.height,
          derivatives: asset.derivatives,
        } as unknown as MediaAsset,
      ];
    });
}
/** No bundled fallback while dynamic adoption is loading, live or unavailable. */
export const publishedMediaAuthority = () => liveState().status !== "bundled";
export function selectedProductMedia(
  productId: string | undefined,
  family: string,
  variant: string,
  size?: string,
) {
  const published = publishedProductMedia(productId, family, variant);
  if (published !== null) return published[0];
  if (
    productId === "conchas-traditional--tricolor" ||
    productId === "conchas-tricolor-pack"
  )
    return undefined;
  return authoredProductMedia(productId, family, variant, size);
}
/** Further photographs of a product: published ones when replaced, else the authored gallery. */
export function productGalleryMedia(
  productId: string | undefined,
  family: string,
  variant: string,
): MediaAsset[] {
  const published = publishedProductMedia(productId, family, variant);
  if (published !== null) return published.slice(1);
  if (
    productId === "conchas-traditional--tricolor" ||
    productId === "conchas-tricolor-pack"
  )
    return [];
  return (
    productMediaAssignments.find((p) => p.productId === productId)
      ?.gallerySourceIds ?? []
  )
    .map((id) => approvedMedia.find((a) => a.sourceId === id))
    .filter((a): a is MediaAsset => !!a);
}
/** Shared Pan de Muerto presentation, opt-in for future category assets. */
export const usesMenuReferencePresentation = (asset: MediaAsset | undefined) =>
  !!asset &&
  (asset.sourceId.startsWith("official-pan-") ||
    ("authoredSourceId" in asset &&
      typeof asset.authoredSourceId === "string" &&
      asset.authoredSourceId.startsWith("official-pan-")) ||
    ("presentation" in asset &&
      asset.presentation?.startsWith("menu-reference") === true));
/** Mixed boards shown for a whole category; never tied to a flavour or pack.
 * Official frames open the gallery; category-media frames for the same category follow. */
export const categoryEditorialMedia = (category: string) =>
  [...official.editorial, ...categories.editorial]
    .filter((e) => e.category === category)
    .flatMap((e) => e.sourceIds)
    .map((id) => approvedMedia.find((a) => a.sourceId === id))
    .filter((a): a is MediaAsset => !!a);
const srcSet = (asset: MediaAsset, format: string) =>
  asset.derivatives
    .filter((d) => d.format === format)
    .map((d) => `${d.src} ${d.width}w`)
    .join(", ");
export function MediaPicture({
  asset,
  alt,
  sizes,
  className,
  active,
  fallback,
  bundledProduct = false,
}: {
  asset: MediaAsset;
  alt: string;
  sizes: string;
  className?: string;
  active?: boolean;
  fallback?: string | null;
  bundledProduct?: boolean;
}) {
  const [failed, setFailed] = useState(0);
  const published = asset.sourceId.startsWith("published-");
  const digital =
    "mediaKind" in asset && asset.mediaKind === "digital-illustration";
  if (published && failed >= 2)
    return (
      <picture
        className={active ? "is-active" : undefined}
        aria-hidden={active === false || undefined}
      >
        <span
          className={
            className ? `${className} b-co-thumb-empty` : "b-menu-no-photo"
          }
          role={alt ? "img" : undefined}
          aria-label={alt || undefined}
          data-media-state="load-error"
          aria-hidden={!alt || undefined}
        >
          <CustomerCopy>3L</CustomerCopy>
        </span>
      </picture>
    );
  const webp = asset.derivatives.filter((d) => d.format === "webp");
  return (
    <picture
      className={active ? "is-active" : undefined}
      aria-hidden={active === false || undefined}
      data-product-media={bundledProduct ? "bundled" : undefined}
      data-media-kind={digital ? "digital-illustration" : undefined}
    >
      {failed === 0 && asset.derivatives.some((d) => d.format === "avif") && (
        <source
          type="image/avif"
          srcSet={srcSet(asset, "avif")}
          sizes={sizes}
        />
      )}
      <img
        src={
          failed >= 2 && fallback
            ? fallback
            : (
                webp.find((d) => d.width === 640) ??
                webp[0] ??
                asset.derivatives[0]
              )?.src
        }
        srcSet={failed >= 2 || !webp.length ? undefined : srcSet(asset, "webp")}
        sizes={sizes}
        width={asset.width!}
        height={asset.height!}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
        style={digital ? { objectFit: "contain" } : undefined}
        onError={
          (digital || published) && failed < 2
            ? () => setFailed((value) => (published ? 2 : value + 1))
            : undefined
        }
      />
    </picture>
  );
}
const ROTATION_MS = 3500;
/**
 * The one gallery rotation: a gentle crossfade every 3.5 seconds. It waits
 * for the next photo to finish loading, mounts only the current and next frame
 * until a full turn has played, and holds still while hovered, focused,
 * off-screen or when reduced motion is requested.
 */
export function MediaRotation({
  frames,
  alt,
  sizes,
  className,
  bundledProduct = false,
}: {
  frames: MediaAsset[];
  alt: string;
  sizes: string;
  className?: string;
  bundledProduct?: boolean;
}) {
  const root = useRef<HTMLSpanElement>(null);
  const [turn, setTurn] = useState(0);
  const [held, setHeld] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = root.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(!!entry?.isIntersecting),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (held || !visible || frames.length < 2) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (motion.matches) return setTurn(0);
      timer = setInterval(
        () =>
          setTurn((value) => {
            const next =
              root.current?.querySelectorAll("img")[
                (value + 1) % frames.length
              ];
            // A frame that has not arrived yet would fade in blank: wait a turn.
            return next?.complete && next.naturalWidth ? value + 1 : value;
          }),
        ROTATION_MS,
      );
    };
    update();
    motion.addEventListener("change", update);
    return () => {
      if (timer) clearInterval(timer);
      motion.removeEventListener("change", update);
    };
  }, [held, visible, frames.length]);
  const current = turn % frames.length;
  return (
    <span
      ref={root}
      className="b-official-rotation"
      data-frame={current}
      onPointerEnter={(event) => {
        // A tap must not leave a touch gallery frozen.
        if (event.pointerType === "mouse") setHeld(true);
      }}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      tabIndex={0}
      role="group"
      aria-label={alt}
    >
      {frames
        .slice(0, Math.min(frames.length, turn + 2))
        .map((asset, index) => (
          <MediaPicture
            key={asset.sourceId}
            asset={asset}
            alt={alt}
            sizes={sizes}
            className={className}
            active={index === current}
            bundledProduct={bundledProduct}
          />
        ))}
    </span>
  );
}
export function ResponsiveMedia({
  productId,
  family,
  variant,
  size,
  fallback,
  alt,
  className,
  sizes = "(max-width: 640px) 90vw, (max-width: 1000px) 45vw, 30vw",
  rotate = false,
  editorial = false,
}: {
  productId?: string;
  family: string;
  variant: string;
  size?: string;
  fallback?: string | null;
  alt: string;
  className?: string;
  sizes?: string;
  rotate?: boolean;
  /** Explicit category/story imagery, independent of product publications. */
  editorial?: boolean;
}) {
  const { text: localize } = useCustomerLanguage();
  // Re-render when a newly published revision replaces a photograph.
  useLiveCatalog();
  const media = editorial
    ? authoredProductMedia(undefined, family, variant, size)
    : selectedProductMedia(productId, family, variant, size);
  const effectiveFallback =
    !editorial && publishedMediaAuthority() ? null : fallback;
  if (!media)
    return effectiveFallback ? (
      <img
        data-product-media={
          !editorial && !publishedMediaAuthority() ? "bundled" : undefined
        }
        src={effectiveFallback}
        alt={localize(alt)}
        className={className}
        loading="lazy"
        decoding="async"
      />
    ) : (
      <span
        className={
          className ? `${className} b-co-thumb-empty` : "b-menu-no-photo"
        }
        role={alt ? "img" : undefined}
        data-media-state="unassigned"
        aria-label={
          alt ? localize("Product photograph coming soon") : undefined
        }
        aria-hidden={!alt || undefined}
      >
        <CustomerCopy>3L</CustomerCopy>
      </span>
    );
  const gallery =
    rotate && !editorial ? productGalleryMedia(productId, family, variant) : [];
  if (gallery.length)
    return (
      <MediaRotation
        key={[media, ...gallery].map((a) => a.sourceId).join(":")}
        bundledProduct={!editorial && !publishedMediaAuthority()}
        frames={[media, ...gallery]}
        alt={localize(alt)}
        sizes={sizes}
        className={className}
      />
    );
  return (
    <MediaPicture
      key={media.sourceId}
      bundledProduct={!editorial && !publishedMediaAuthority()}
      asset={media}
      alt={localize(alt)}
      sizes={sizes}
      className={className}
      fallback={effectiveFallback}
    />
  );
}
