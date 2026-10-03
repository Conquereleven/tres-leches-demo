import { useLanguage as useCustomerLanguage } from "./localization";
import manifest from "./media-manifest.json";
export const approvedMedia = manifest.assets.filter(
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
  const primary = manifest.products.find(
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
}: {
  productId?: string;
  family: string;
  variant: string;
  size?: string;
  fallback?: string | null;
  alt: string;
  className?: string;
  sizes?: string;
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
  const derivatives = media.derivatives;
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
