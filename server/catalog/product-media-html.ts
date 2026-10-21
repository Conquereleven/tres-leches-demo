/** Build-time product photographs cannot override a live publication before JS runs.
 * Only renderer-owned product markers are replaced; editorial/story imagery is intact.
 * Called only by the existing dynamic-catalog HTML response path.
 */
export function withoutBundledProductMedia(html: string): string {
  const placeholder =
    '<span class="b-menu-no-photo" aria-hidden="true">3L</span>';
  return html
    .replace(
      /<picture\b(?=[^>]*\bdata-product-media="bundled")[^>]*>[\s\S]*?<\/picture>/g,
      placeholder,
    )
    .replace(
      /<img\b(?=[^>]*\bdata-product-media="bundled")[^>]*>/g,
      placeholder,
    );
}
