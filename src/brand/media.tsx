import { useLanguage as useCustomerLanguage } from "./localization";
import manifest from "./media-manifest.json";
import categories from "./category-media.json";
import official from "./official-pan-media.json";
import { useEffect, useRef, useState } from "react";
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
export function selectedProductMedia(
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
/** Shared Pan de Muerto presentation, opt-in for future category assets. */
export const usesMenuReferencePresentation = (asset: MediaAsset | undefined) =>
  !!asset &&
  (asset.sourceId.startsWith("official-pan-") ||
    ("presentation" in asset && asset.presentation === "menu-reference"));
/** Mixed boards shown for a whole category; never tied to a flavour or pack. */
export const categoryEditorialMedia = (category: string) =>
  (
    [...official.editorial, ...categories.editorial].find(
      (e) => e.category === category,
    )?.sourceIds ?? []
  )
    .map((id) => approvedMedia.find((a) => a.sourceId === id))
    .filter((a): a is MediaAsset => !!a);
const srcSet = (asset: MediaAsset, format: string) =>
  asset.derivatives
    .filter((d) => d.format === format)
    .map((d) => `${d.src} ${d.width}w`)
    .join(", ");
function MediaPicture({
  asset,
  alt,
  sizes,
  className,
  active,
  fallback,
}: {
  asset: MediaAsset;
  alt: string;
  sizes: string;
  className?: string;
  active?: boolean;
  fallback?: string | null;
}) {
  const [failed, setFailed] = useState(0);
  const digital =
    "mediaKind" in asset && asset.mediaKind === "digital-illustration";
  const webp = asset.derivatives.filter((d) => d.format === "webp");
  return (
    <picture
      className={active ? "is-active" : undefined}
      aria-hidden={active === false || undefined}
      data-media-kind={digital ? "digital-illustration" : undefined}
    >
      {failed === 0 && (
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
            : (webp.find((d) => d.width === 640) ?? webp[0])?.src
        }
        srcSet={failed >= 2 ? undefined : srcSet(asset, "webp")}
        sizes={sizes}
        width={asset.width!}
        height={asset.height!}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
        style={digital ? { objectFit: "contain" } : undefined}
        onError={
          digital && failed < 2
            ? () => setFailed((value) => value + 1)
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
}: {
  frames: MediaAsset[];
  alt: string;
  sizes: string;
  className?: string;
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
}) {
  const { text: localize } = useCustomerLanguage();
  const media = selectedProductMedia(productId, family, variant, size);
  if (!media)
    return fallback ? (
      <img
        src={fallback}
        alt={localize(alt)}
        className={className}
        loading="lazy"
        decoding="async"
      />
    ) : null;
  const gallery = rotate
    ? (
        productMediaAssignments.find((p) => p.productId === productId)
          ?.gallerySourceIds ?? []
      )
        .map((id) => approvedMedia.find((a) => a.sourceId === id))
        .filter((a): a is MediaAsset => !!a)
    : [];
  if (gallery.length)
    return (
      <MediaRotation
        frames={[media, ...gallery]}
        alt={localize(alt)}
        sizes={sizes}
        className={className}
      />
    );
  return (
    <MediaPicture
      asset={media}
      alt={localize(alt)}
      sizes={sizes}
      className={className}
      fallback={fallback}
    />
  );
}
