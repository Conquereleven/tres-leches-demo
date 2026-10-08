import { useLanguage as useCustomerLanguage } from "./localization";
import manifest from "./media-manifest.json";
import official from "./official-pan-media.json";
import { useEffect, useState } from "react";
export const productMediaAssignments = [
  ...official.products,
  ...manifest.products,
];
export const approvedMedia = [...official.assets, ...manifest.assets].filter(
  (a) => a.status === "assigned",
);
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

  const primary = selectedProductMedia(productId, family, variant, size);
  const assignment = official.products.find((p) => p.productId === productId);
  const frames = primary
    ? [
        primary,
        ...(assignment?.gallerySourceIds ?? [])
          .map((id) => approvedMedia.find((a) => a.sourceId === id))
          .filter((a): a is NonNullable<typeof a> => !!a),
      ]
    : [];
  const [frame, setFrame] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!rotate || paused || frames.length < 2) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (!motion.matches)
        timer = setInterval(
          () => setFrame((value) => (value + 1) % frames.length),
          7000,
        );
      else setFrame(0);
    };
    update();
    motion.addEventListener("change", update);
    return () => {
      if (timer) clearInterval(timer);
      motion.removeEventListener("change", update);
    };
  }, [rotate, paused, frames.length, productId]);
  const media = primary;
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
  const derivatives = media.derivatives;
  if (rotate && frames.length > 1)
    return (
      <span
        className="b-official-rotation"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        tabIndex={0}
        aria-label={localize(alt)}
      >
        {frames.map((asset, index) => (
          <picture
            key={asset.sourceId}
            className={index === frame % frames.length ? "is-active" : ""}
            aria-hidden={index !== frame % frames.length}
          >
            <source
              type="image/avif"
              srcSet={asset.derivatives
                .filter((d) => d.format === "avif")
                .map((d) => `${d.src} ${d.width}w`)
                .join(", ")}
              sizes={sizes}
            />
            <img
              src={
                asset.derivatives.find(
                  (d) => d.format === "webp" && d.width === 640,
                )?.src
              }
              srcSet={asset.derivatives
                .filter((d) => d.format === "webp")
                .map((d) => `${d.src} ${d.width}w`)
                .join(", ")}
              sizes={sizes}
              width={asset.width!}
              height={asset.height!}
              alt={localize(alt)}
              loading="lazy"
              decoding="async"
              onLoad={(event) => {
                event.currentTarget
                  .closest("picture")
                  ?.classList.add("is-loaded");
              }}
              className={className}
            />
          </picture>
        ))}
      </span>
    );
  const srcSet = (format: string) =>
    derivatives
      .filter((d) => d.format === format)
      .map((d) => `${d.src} ${d.width}w`)
      .join(", ");
  return (
    <picture>
      <source type="image/avif" srcSet={srcSet("avif")} sizes={sizes} />
      <img
        src={
          derivatives.find((d) => d.format === "webp" && d.width === 640)?.src
        }
        srcSet={srcSet("webp")}
        sizes={sizes}
        width={media.width!}
        height={media.height!}
        alt={localize(alt)}
        className={className}
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}
