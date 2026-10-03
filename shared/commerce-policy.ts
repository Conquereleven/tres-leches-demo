/** Approved Dubai business policy, shared by browser and authoritative server. */
export const MAX_ITEM_QUANTITY = 100;
export const BUSINESS_TIMEZONE = "Asia/Dubai";
export const DELIVERY_WINDOWS = [
  { label: "8:00 AM – 1:00 PM", startHour: 8 },
  { label: "1:00 PM – 4:00 PM", startHour: 13 },
  { label: "4:00 PM – 9:00 PM", startHour: 16 },
] as const;
export const SEASONAL_RULES = [
  { prefix: "pan-de-muerto-", exclude: "-pack-", start: "10-03", end: "11-15" },
];
export function businessDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function availableSku(id: string, now = new Date()) {
  const date = businessDate(now).slice(5);
  return SEASONAL_RULES.every(
    (r) =>
      !id.startsWith(r.prefix) ||
      id.includes(r.exclude) ||
      (date >= r.start && date <= r.end),
  );
}
export function leadHours(ids: string[]) {
  return ids.some((id) => /gelatina|^rosca|^tres-leches-mango-/i.test(id))
    ? 24
    : 12;
}
export function validWindow(
  date: string,
  slot: string,
  now = new Date(),
  hours = 12,
) {
  const window = DELIVERY_WINDOWS.find((w) => w.label === slot);
  if (!window || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date <= businessDate(now))
    return false;
  const midnight = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(midnight.valueOf()) ||
    midnight.toISOString().slice(0, 10) !== date
  )
    return false;
  const start = new Date(
    `${date}T${String(window.startHour).padStart(2, "0")}:00:00+04:00`,
  );
  return start.valueOf() - now.valueOf() >= hours * 3600000;
}
