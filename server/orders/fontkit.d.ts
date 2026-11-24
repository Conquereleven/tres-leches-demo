/** The part of fontkit 2 used to measure and shape print text. */
declare module "fontkit" {
  export interface Font {
    unitsPerEm: number;
    ascent: number;
    descent: number;
    hasGlyphForCodePoint(codePoint: number): boolean;
    glyphForCodePoint(codePoint: number): { id: number; codePoints: number[] };
    layout(
      text: string,
      features?: string[],
    ): {
      advanceWidth: number;
      direction: "ltr" | "rtl";
      glyphs: { id: number; codePoints: number[] }[];
    };
  }
  export function create(buffer: Buffer): Font;
}
