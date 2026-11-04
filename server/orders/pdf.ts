/**
 * Minimal print-ready PDF writer for operational order documents: A4 pages,
 * the standard Helvetica fonts (no embedding, no dependency) and WinAnsi text.
 * A character that WinAnsi cannot represent is printed as "?" and counted, so
 * the caller can point the reader to the order page instead of guessing.
 */
const PAGE = { width: 595.28, height: 841.89, margin: 48 } as const;
const FOOTER_SPACE = 28;

// Helvetica glyph widths (1/1000 em) for ASCII 32–126, from the standard AFM.
const WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];
// Windows-1252 code points 0x80–0x9F that differ from Latin-1.
const CP1252: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  "„": 0x84,
  "…": 0x85,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "™": 0x99,
};

function encode(text: string): { bytes: number[]; lossy: number } {
  const bytes: number[] = [];
  let lossy = 0;
  for (const ch of text.normalize("NFC").replaceAll("→", "->")) {
    const code = ch.codePointAt(0)!;
    if (code === 9) bytes.push(32);
    else if (code >= 32 && code <= 126) bytes.push(code);
    else if (code >= 0xa0 && code <= 0xff) bytes.push(code);
    else if (CP1252[ch] !== undefined) bytes.push(CP1252[ch]!);
    else if (code < 32 || code === 0x7f) continue;
    else {
      bytes.push(63);
      lossy++;
    }
  }
  return { bytes, lossy };
}
const glyph = (byte: number) =>
  byte >= 32 && byte <= 126 ? WIDTHS[byte - 32]! : 556;
const width = (bytes: number[], size: number, bold: boolean) =>
  (bytes.reduce((n, b) => n + glyph(b), 0) / 1000) * size * (bold ? 1.08 : 1);
const hex = (bytes: number[]) =>
  `<${bytes.map((b) => b.toString(16).padStart(2, "0")).join("")}>`;

export type TextStyle = { size?: number; bold?: boolean; indent?: number };

export class PdfDocument {
  private pages: string[][] = [];
  private y = 0;
  /** Characters printed as "?" since the last call to takeLossy(). */
  private lossy = 0;
  constructor(private readonly title: string) {}

  newPage() {
    this.pages.push([]);
    this.y = PAGE.height - PAGE.margin;
  }
  private get ops() {
    if (!this.pages.length) this.newPage();
    return this.pages[this.pages.length - 1]!;
  }
  private ensure(height: number) {
    if (!this.pages.length || this.y - height < PAGE.margin + FOOTER_SPACE)
      this.newPage();
  }
  /** Wrapped paragraph; breaks long words so nothing runs off the page. */
  text(value: string, style: TextStyle = {}) {
    const size = style.size ?? 10,
      bold = !!style.bold,
      indent = style.indent ?? 0,
      leading = size * 1.35,
      max = PAGE.width - PAGE.margin * 2 - indent;
    const { bytes, lossy } = encode(value);
    this.lossy += lossy;
    const lines: number[][] = [];
    let line: number[] = [];
    let word: number[] = [];
    const flushWord = () => {
      const candidate = line.length ? [...line, 32, ...word] : word;
      if (width(candidate, size, bold) <= max) line = candidate;
      else {
        if (line.length) lines.push(line);
        line = [];
        for (const b of word) {
          if (line.length && width([...line, b], size, bold) > max) {
            lines.push(line);
            line = [];
          }
          line.push(b);
        }
      }
      word = [];
    };
    for (const b of bytes) {
      if (b === 32) {
        if (word.length) flushWord();
      } else word.push(b);
    }
    if (word.length) flushWord();
    if (line.length || !lines.length) lines.push(line);
    for (const l of lines) {
      this.ensure(leading);
      this.y -= leading;
      this.ops.push(
        `BT /${bold ? "F2" : "F1"} ${size} Tf ${(PAGE.margin + indent).toFixed(2)} ${this.y.toFixed(2)} Td ${hex(l)} Tj ET`,
      );
    }
  }
  gap(height = 8) {
    this.y -= height;
  }
  rule() {
    this.ensure(10);
    this.y -= 6;
    this.ops.push(
      `0.6 w 0.64 0.55 0.36 RG ${PAGE.margin} ${this.y.toFixed(2)} m ${(PAGE.width - PAGE.margin).toFixed(2)} ${this.y.toFixed(2)} l S`,
    );
    this.y -= 4;
  }
  takeLossy() {
    const n = this.lossy;
    this.lossy = 0;
    return n;
  }
  get pageCount() {
    return this.pages.length;
  }

  /** Serialises the document; `footer` is printed on every page. */
  toBuffer(footer: (page: number, pages: number) => string): Buffer {
    if (!this.pages.length) this.newPage();
    const total = this.pages.length;
    const objects: string[] = [];
    const add = (body: string) => objects.push(body);
    const catalog = add("");
    const pagesId = add("");
    const regular = add(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    );
    const bold = add(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    );
    const kids: number[] = [];
    this.pages.forEach((ops, i) => {
      const foot = encode(footer(i + 1, total)).bytes;
      const stream = [
        ...ops,
        `BT /F1 8 Tf ${PAGE.margin} ${PAGE.margin - 12} Td ${hex(foot)} Tj ET`,
      ].join("\n");
      const content = add(
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      );
      kids.push(
        add(
          `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${content} 0 R >>`,
        ),
      );
    });
    objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] =
      `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
    const info = add(
      `<< /Title ${hex(encode(this.title).bytes)} /Producer (3L Operations) >>`,
    );
    let out = "%PDF-1.4\n";
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    // Every byte above is ASCII (text is hex-encoded), so offsets are exact.
    return Buffer.from(out, "latin1");
  }
}
