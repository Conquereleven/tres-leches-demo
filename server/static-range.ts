/**
 * One byte range of a static file, per RFC 9110. Safari will not play a video
 * from a server that ignores Range, so media needs this; other files simply
 * gain resumable downloads. Multi-range requests are answered in full.
 */
export type RangeResult =
  | { status: 200 }
  | { status: 206; start: number; end: number }
  | { status: 416 };
export function byteRange(
  header: string | undefined,
  size: number,
): RangeResult {
  if (!header) return { status: 200 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return { status: 200 };
  let start: number, end: number;
  if (!match[1]) {
    // Suffix form: the last N bytes.
    const suffix = Number(match[2]);
    if (!suffix) return { status: 416 };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (!Number.isSafeInteger(start) || start >= size || end < start)
    return { status: 416 };
  return { status: 206, start, end };
}
