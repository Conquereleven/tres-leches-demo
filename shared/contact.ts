/** E.164 storage without inferring a country. Formatting characters are harmless. */
export function normalizeWhatsAppNumber(value: string): string | null {
  const raw = value.trim();
  if (!raw || !/^(\+|00)[0-9 ()\-.]+$/.test(raw)) return null;
  const compact = raw.replace(/[ ()\-.]/g, "").replace(/^00/, "+");
  return /^\+[1-9][0-9]{6,14}$/.test(compact) ? compact : null;
}
