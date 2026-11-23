import { readFileSync } from "node:fs";
import { create, type Font } from "fontkit";
import bidiFactory from "bidi-js";

/**
 * Text engine for printed order documents. Bundled OFL fonts only (Montserrat
 * for Latin, Noto Sans Arabic for Arabic); Arabic is shaped by fontkit and
 * ordered with the Unicode bidirectional algorithm, so customer text prints as
 * written. Scripts no bundled font covers become a named marker, never a "?".
 */
export type Weight = 500 | 600 | 700 | 800;
export type FontId =
  | "latin-500"
  | "latin-600"
  | "latin-700"
  | "latin-800"
  | "arabic-400"
  | "arabic-700";
export const FONT_FILES: Record<FontId, string> = {
  "latin-500": "Montserrat-Medium.ttf",
  "latin-600": "Montserrat-SemiBold.ttf",
  "latin-700": "Montserrat-Bold.ttf",
  "latin-800": "Montserrat-ExtraBold.ttf",
  "arabic-400": "NotoSansArabic-Regular.ttf",
  "arabic-700": "NotoSansArabic-Bold.ttf",
};
// Next to this module in the source tree and next to the server bundle in dist.
const ASSETS = new URL("./print-assets/", import.meta.url);
export const assetPath = (name: string) => new URL(name, ASSETS);

const loaded = new Map<FontId, { data: Buffer; font: Font }>();
export function fontData(id: FontId) {
  let entry = loaded.get(id);
  if (!entry) {
    const data = readFileSync(assetPath(FONT_FILES[id]));
    entry = { data, font: create(data) };
    loaded.set(id, entry);
  }
  return entry;
}
const font = (id: FontId) => fontData(id).font;

const ARABIC =
  /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/;
const latin = (w: Weight): FontId => `latin-${w}`;
const arabic = (w: Weight): FontId => (w >= 600 ? "arabic-700" : "arabic-400");
const has = (id: FontId, ch: string) =>
  font(id).hasGlyphForCodePoint(ch.codePointAt(0)!);
const covered = (ch: string) => has("latin-500", ch) || has("arabic-400", ch);

const SCRIPTS: [RegExp, string][] = [
  [/\p{Script=Hebrew}/u, "Hebrew"],
  [/\p{Script=Cyrillic}/u, "Cyrillic"],
  [/\p{Script=Greek}/u, "Greek"],
  [/\p{Script=Devanagari}/u, "Devanagari"],
  [/\p{Script=Bengali}/u, "Bengali"],
  [/\p{Script=Tamil}/u, "Tamil"],
  [/\p{Script=Malayalam}/u, "Malayalam"],
  [/\p{Script=Thai}/u, "Thai"],
  [/\p{Script=Han}/u, "Chinese"],
  [/\p{Script=Hangul}/u, "Korean"],
  [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, "Japanese"],
  [/\p{Extended_Pictographic}/u, "emoji"],
];
const JOINING = /[\s\p{M}\u200c\u200d\ufe0f]/u;

/**
 * Normalises text for print. Spaces, controls and invisible breaks become a
 * plain space (words separated in the original are never joined); each run
 * of characters without a bundled glyph, with the spaces and marks between
 * them, becomes one explicit marker.
 */
export function printable(value: string) {
  const chars = [
    ...value
      .normalize("NFC")
      .replace(
        /[\u0000-\u0009\u000b-\u001f\u007f\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]/g,
        " ",
      ),
  ];
  let text = "";
  let markers = 0;
  for (let i = 0; i < chars.length;) {
    if (chars[i] === "\n" || covered(chars[i]!)) {
      text += chars[i++];
      continue;
    }
    let end = i + 1;
    for (let j = end; j < chars.length && chars[j] !== "\n"; j++) {
      if (!covered(chars[j]!)) end = j + 1;
      else if (!JOINING.test(chars[j]!)) break;
    }
    const run = chars.slice(i, end).join("");
    const label = SCRIPTS.find(([re]) => re.test(run))?.[1] ?? "non-Latin";
    text +=
      label === "emoji" ? "[emoji]" : `[${label} text \u2013 see order page]`;
    markers++;
    i = end;
  }
  return { text, markers };
}

// Shaped advance per em, memoised: wrapping measures the same words often.
const advances = new Map<string, { advance: number; direction: Direction }>();
function layoutInfo(id: FontId, text: string) {
  const key = `${id}\u0000${text}`;
  let value = advances.get(key);
  if (value === undefined) {
    const f = font(id);
    const run = f.layout(text, id.startsWith("arabic") ? ["kern"] : undefined);
    value = {
      advance: run.advanceWidth / f.unitsPerEm,
      direction: run.direction,
    };
    if (advances.size > 50_000) advances.clear();
    advances.set(key, value);
  }
  return value;
}

export type Run = { text: string; font: FontId; width: number };
export type TextStyle = {
  size: number;
  weight?: Weight;
  /** Letter spacing in em; never applied to Arabic, whose letters join. */
  spacing?: number;
};
export type Direction = "ltr" | "rtl";

const bidi = bidiFactory();

/** Paragraph direction from its first strong character (UAX #9 P2-P3). */
export const direction = (text: string): Direction =>
  bidi.getEmbeddingLevels(text).paragraphs[0]?.level === 1 ? "rtl" : "ltr";

/**
 * One printed line in visual (left-to-right drawing) order. Arabic runs keep
 * their logical text: fontkit shapes and reverses them itself.
 */
export function shapeLine(
  line: string,
  style: TextStyle,
  dir: Direction = direction(line),
): { runs: Run[]; width: number } {
  const weight = style.weight ?? 500;
  const levels = bidi.getEmbeddingLevels(line, dir);
  const order = Array.from({ length: line.length }, (_, i) => i);
  for (const [start, end] of bidi.getReorderSegments(line, levels) as [
    number,
    number,
  ][]) {
    const flipped = order.slice(start, end + 1).reverse();
    order.splice(start, flipped.length, ...flipped);
  }
  const groups: { chars: string[]; font: FontId; rtl: boolean }[] = [];
  for (const i of order) {
    const rtl = (levels.levels[i]! & 1) === 1;
    const ch = (rtl && bidi.getMirroredCharacter(line[i]!)) || line[i]!;
    const inArabic = ARABIC.test(ch) || (rtl && /[ \u200c\u200d]/.test(ch));
    const id =
      inArabic || !has(latin(weight), ch) ? arabic(weight) : latin(weight);
    const shaped = rtl && id.startsWith("arabic");
    const last = groups.at(-1);
    if (last && last.font === id && last.rtl === shaped) last.chars.push(ch);
    else groups.push({ chars: [ch], font: id, rtl: shaped });
  }
  const runs = groups.map(({ chars, font: id }) => {
    // Bidi levels choose visual order and run boundaries, not fontkit's shaping
    // direction. Arabic numerals have even levels but fontkit still selects
    // Arabic/rtl; punctuation-only runs can select ltr despite an odd level.
    // Compensate exactly the direction chosen by the actual bundled shaper.
    const visual = chars.join("");
    const reverses =
      id.startsWith("arabic") && layoutInfo(id, visual).direction === "rtl";
    const text = reverses ? chars.reverse().join("") : visual;
    const tracking = id.startsWith("latin") ? (style.spacing ?? 0) : 0;
    const width =
      layoutInfo(id, text).advance * style.size +
      tracking * style.size * text.length;
    return { text, font: id, width };
  });
  return { runs, width: runs.reduce((n, r) => n + r.width, 0) };
}

export const measure = (text: string, style: TextStyle) =>
  shapeLine(text, style).width;

/**
 * Greedy wrap at spaces in logical order; customer line breaks are kept and
 * a word longer than the line is broken, so nothing runs off the page.
 */
export function wrap(text: string, style: TextStyle, max: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r\n|\r|\n/)) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, style) <= max) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      for (const ch of word) {
        if (line && measure(line + ch, style) > max) {
          lines.push(line);
          line = "";
        }
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}
