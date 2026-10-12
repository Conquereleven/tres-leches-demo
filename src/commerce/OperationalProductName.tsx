import {
  TRANSLATION_REVIEW,
  type operationalProductName,
} from "./product-names";

export function OperationalProductName({
  product,
  id,
}: {
  product: ReturnType<typeof operationalProductName>;
  id: string;
}) {
  return (
    <span lang="en" className="ops-product-name">
      {product.name}
      {product.reviewRequired && (
        <strong className="ops-translation-review">
          {" "}
          — {TRANSLATION_REVIEW} ({id})
        </strong>
      )}
    </span>
  );
}
