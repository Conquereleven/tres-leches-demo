import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import {
  FONT_FILES,
  assetPath,
  direction,
  fontData,
  printable,
  shapeLine,
  wrap,
  type Direction,
  type FontId,
  type TextStyle,
} from "./print-text";

export const mm = (v: number) => (v * 72) / 25.4;
export const A4 = { width: mm(210), height: mm(297) } as const;
/** Print palette: all operational information is set in ink. */
export const INK = "#27242D";
export const MUTED = "#5A565F";
export const GOLD = "#A28D5B";
export const BLUSH = "#F6DFE0";

export type Style = TextStyle & {
  color?: string;
  upper?: boolean;
  /** Line height as a multiple of the size. */
  leading?: number;
};
type Align = "left" | "right" | "center";
type Box = {
  stroke?: string;
  fill?: string;
  width?: number;
  radius?: number;
  dash?: number;
};

// Montserrat's vertical metrics: the baseline sits this far into a line box.
const ASCENT = 0.968;
const CONTENT = 1.219;
const lineHeight = (s: Style) => s.size * (s.leading ?? 1.3);

const WORDMARK = fileURLToPath(assetPath("wordmark.png"));

/**
 * A thin, synchronous layer over pdfkit: embedded and subset OFL fonts with
 * ToUnicode maps (printable, searchable text), vector boxes and rules, and
 * buffered pages so running headers and "Page n of N" are added at the end.
 * `trace` records every printed string in logical order, for tests.
 */
export class Canvas {
  readonly pdf: PDFKit.PDFDocument;
  readonly trace: string[] = [];
  /** Text runs replaced by a marker because no bundled font covers them. */
  markers = 0;
  private placements: { page: number; x: number }[] = [];
  private transformed = false;
  constructor(
    title: string,
    at: Date,
    private layout: "a4" | "a5" | "a5-two-up" = "a4",
  ) {
    this.pdf = new PDFDocument({
      // No standard (Helvetica) font is ever loaded or embedded.
      font: null as unknown as string,
      autoFirstPage: false,
      bufferPages: true,
      margin: 0,
      pdfVersion: "1.7",
      info: {
        Title: title,
        Creator: "3L Operations",
        Producer: "3L Operations",
        CreationDate: at,
        ModDate: at,
      },
    });
    // Parsed once per process and shared: pdfkit only reads and subsets them.
    for (const id of Object.keys(FONT_FILES) as FontId[])
      this.pdf.registerFont(id, fontData(id).font as unknown as Buffer);
  }
  private endTransform() {
    if (this.transformed) this.pdf.restore();
    this.transformed = false;
  }
  private transform(x: number) {
    this.pdf.save();
    if (this.layout !== "a4") this.pdf.translate(x, 0).scale(148 / 210);
    this.transformed = true;
  }
  addPage() {
    this.endTransform();
    const paired = this.layout === "a5-two-up";
    const right = paired && this.placements.length % 2 === 1;
    if (!right)
      this.pdf.addPage({
        size:
          this.layout === "a4"
            ? [A4.width, A4.height]
            : paired
              ? [mm(297), mm(210)]
              : [mm(148), mm(210)],
        margin: 0,
      });
    if (paired && !right)
      this.pdf
        .save()
        .lineWidth(0.5)
        .dash(3)
        .moveTo(mm(148.5), mm(5))
        .lineTo(mm(148.5), mm(205))
        .stroke(MUTED)
        .restore();
    const x = right ? mm(149) : 0;
    this.placements.push({ page: this.pdf.bufferedPageRange().count - 1, x });
    this.transform(x);
  }
  get pageCount() {
    return this.pdf.bufferedPageRange().count;
  }
  switchToPage(index: number) {
    this.endTransform();
    const p = this.placements[index]!;
    this.pdf.switchToPage(p.page);
    this.transform(p.x);
  }

  /** Prepared text: printable, upper-cased when the style asks for it. */
  private prepare(value: string, style: Style) {
    const { text, markers } = printable(value);
    this.markers += markers;
    return style.upper ? text.toLocaleUpperCase("en") : text;
  }
  width(value: string, style: Style) {
    return shapeLine(this.prepare(value, style), style).width;
  }
  /** One line whose box starts at `y`; returns its drawn width. */
  text(
    x: number,
    y: number,
    value: string,
    style: Style,
    opts: { align?: Align; width?: number; dir?: Direction } = {},
  ) {
    const text = this.prepare(value, style);
    return this.drawLine(x, y, text, style, opts);
  }
  private drawLine(
    x: number,
    y: number,
    text: string,
    style: Style,
    opts: { align?: Align; width?: number; dir?: Direction },
  ) {
    this.trace.push(text);
    const { runs, width } = shapeLine(text, style, opts.dir ?? "ltr");
    const box = opts.width ?? width;
    let at =
      opts.align === "right"
        ? x + box - width
        : opts.align === "center"
          ? x + (box - width) / 2
          : x;
    const baseline =
      y + (lineHeight(style) - CONTENT * style.size) / 2 + ASCENT * style.size;
    for (const run of runs) {
      this.pdf
        .font(run.font)
        .fontSize(style.size)
        .fillColor(style.color ?? INK)
        .text(run.text, at, baseline, {
          lineBreak: false,
          baseline: "alphabetic",
          // Explicit features make pdfkit shape an Arabic run as a whole:
          // word by word, spaces in right-to-left runs would be misplaced.
          features: run.font.startsWith("arabic") ? ["kern"] : undefined,
          characterSpacing: run.font.startsWith("latin")
            ? (style.spacing ?? 0) * style.size
            : 0,
        });
      at += run.width;
    }
    return width;
  }
  lines(value: string, style: Style, max: number) {
    return wrap(this.prepare(value, style), style, max);
  }
  paragraphHeight(value: string, style: Style, max: number) {
    return this.lines(value, style, max).length * lineHeight(style);
  }
  /**
   * Wrapped text. Customer-written `free` text keeps its own direction: a
   * right-to-left paragraph is ordered and aligned right. Other text (names,
   * addresses, products) reads left to right with embedded Arabic in order.
   */
  paragraph(
    x: number,
    y: number,
    max: number,
    value: string,
    style: Style,
    free = false,
  ) {
    let height = 0;
    for (const paragraph of value.split(/\r\n|\r|\n/)) {
      const dir = free ? direction(paragraph) : "ltr";
      for (const line of this.lines(paragraph, style, max)) {
        this.drawLine(x, y + height, line, style, {
          dir,
          align: dir === "rtl" ? "right" : "left",
          width: max,
        });
        height += lineHeight(style);
      }
    }
    return height;
  }

  lineHeight(style: Style) {
    return lineHeight(style);
  }

  rect(x: number, y: number, w: number, h: number, b: Box) {
    const p = this.pdf;
    p.save().lineWidth(b.width ?? 0.75);
    if (b.dash) p.dash(b.dash, { space: b.dash });
    if (b.radius) p.roundedRect(x, y, w, h, b.radius);
    else p.rect(x, y, w, h);
    if (b.fill && b.stroke) p.fillAndStroke(b.fill, b.stroke);
    else if (b.fill) p.fill(b.fill);
    else p.stroke(b.stroke ?? INK);
    p.undash().restore();
  }
  rule(
    x1: number,
    y: number,
    x2: number,
    color = MUTED,
    width = 0.5,
    dash = 0,
  ) {
    const p = this.pdf.save().lineWidth(width);
    if (dash) p.dash(dash, { space: dash });
    p.moveTo(x1, y).lineTo(x2, y).stroke(color).undash().restore();
  }
  checkbox(x: number, y: number, size = mm(5.2)) {
    this.rect(x, y, size, size, { stroke: INK, width: 1.1, radius: mm(0.8) });
  }
  wordmark(x: number, y: number, height: number) {
    // pdfkit embeds an image once per document only when given a path.
    this.pdf.image(WORDMARK, x, y, { height });
  }

  /**
   * Ends the document and returns its bytes. pdfkit writes synchronously for
   * TrueType fonts and opaque PNGs (the wordmark is flattened on white for
   * this reason: alpha PNGs are embedded asynchronously).
   */
  finish(): Buffer {
    this.endTransform();
    this.pdf.end();
    const chunks: Buffer[] = [];
    for (let chunk; (chunk = this.pdf.read() as Buffer | null) !== null;)
      chunks.push(chunk);
    const out = Buffer.concat(chunks);
    if (!out.subarray(-8).toString("latin1").includes("%%EOF"))
      throw new Error("Incomplete PDF output");
    return out;
  }
}
