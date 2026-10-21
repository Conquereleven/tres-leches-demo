/** Show factual product sizes, not a shared family name that may name another flavour.
 * Classification and editable family metadata remain unchanged.
 */
export function productListingSizes(
  variants: { size: string | null }[],
): string {
  return [...new Set(variants.map((v) => v.size).filter(Boolean))].join(" / ");
}
