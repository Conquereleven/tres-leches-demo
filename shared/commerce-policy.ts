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
/** 21:00 Dubai minute is inclusive; 21:01 is the first closed minute. */
export function nextDayClosed(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const number = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return number("hour") * 60 + number("minute") > 21 * 60;
}
export function earliestProductionDate(now = new Date()) {
  const day = new Date(`${businessDate(now)}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + (nextDayClosed(now) ? 2 : 1));
  return day.toISOString().slice(0, 10);
}
/** First date with at least one valid window; combines cutoff and product lead time. */
export function earliestFulfillmentDate(now = new Date(), hours = 12) {
  const day = new Date(`${earliestProductionDate(now)}T00:00:00Z`);
  for (let i = 0; i < 32; i++) {
    const date = day.toISOString().slice(0, 10);
    if (DELIVERY_WINDOWS.some((w) => validWindow(date, w.label, now, hours)))
      return date;
    day.setUTCDate(day.getUTCDate() + 1);
  }
  throw new Error("No fulfillment window within booking horizon");
}
export function validWindow(
  date: string,
  slot: string,
  now = new Date(),
  hours = 12,
) {
  const window = DELIVERY_WINDOWS.find((w) => w.label === slot);
  if (
    !window ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    date < earliestProductionDate(now)
  )
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
