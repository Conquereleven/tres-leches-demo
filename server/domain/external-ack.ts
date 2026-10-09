/**
 * Activation cutoff for acknowledging external Paymennt checkouts
 * (`PAYMENNT_EXTERNAL_ACK_SINCE`).
 *
 * Unset means the feature is off. A set value must be an exact UTC instant
 * (`2026-10-12T08:00:00Z`): anything ambiguous, local, or impossible stops
 * the server from starting rather than guessing a cutoff.
 */
const SHAPE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/;

/**
 * No configured cutoff may be earlier than this. The unmatched receipts
 * audited in Production on 9 October 2026 were all first received before
 * 11:00 UTC that day, so this floor keeps them ineligible whatever value is
 * later typed into configuration.
 */
export const EXTERNAL_ACK_FLOOR_MS = Date.parse("2026-10-09T13:00:00.000Z");

export function parseExternalAckSince(
  value: string | undefined,
): number | undefined {
  if (value === undefined) return undefined;
  const match = SHAPE.exec(value);
  const instant = match ? Date.parse(value) : NaN;
  // Date.parse rolls impossible dates forward (30 February becomes 2 March).
  // Only accept a value that reads back as exactly what was written.
  const canonical = match
    ? `${match[1]}.${(match[2] ?? "").padEnd(3, "0")}Z`
    : "";
  if (
    !Number.isFinite(instant) ||
    new Date(instant).toISOString() !== canonical
  )
    throw new Error(
      "Invalid PAYMENNT_EXTERNAL_ACK_SINCE (exact UTC ISO 8601 instant required)",
    );
  return Math.max(instant, EXTERNAL_ACK_FLOOR_MS);
}
