import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

// Tiny layout kit over pdf-lib for branded A4 documents. Standard fonts only
// (WinAnsi), so amounts use "NGN"/"USD" codes rather than the ₦ glyph.

export const A4 = { w: 595.28, h: 841.89 };
export const M = 48; // margin
export const INK = rgb(0.07, 0.07, 0.09);
export const MUTED = rgb(0.42, 0.42, 0.47);
export const LINE = rgb(0.88, 0.88, 0.9);
export const ACCENT = rgb(0.31, 0.27, 0.9);

/** Replace characters WinAnsi can't encode so pdf-lib never throws on user text. */
export function safe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/₦/g, "NGN ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

export class Doc {
  pdf!: PDFDocument;
  page!: PDFPage;
  font!: PDFFont;
  bold!: PDFFont;
  y = A4.h - M;

  static async create(title: string): Promise<Doc> {
    const d = new Doc();
    d.pdf = await PDFDocument.create();
    d.pdf.setTitle(title);
    d.pdf.setProducer("Figuraid OS");
    d.pdf.setCreator("Figuraid OS");
    d.font = await d.pdf.embedFont(StandardFonts.Helvetica);
    d.bold = await d.pdf.embedFont(StandardFonts.HelveticaBold);
    d.newPage();
    return d;
  }

  newPage() {
    this.page = this.pdf.addPage([A4.w, A4.h]);
    this.y = A4.h - M;
  }

  ensure(space: number) {
    if (this.y - space < M + 30) this.newPage();
  }

  text(t: string, x: number, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: "left" | "right"; width?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const s = safe(t);
    const w = font.widthOfTextAtSize(s, size);
    const px = opts.align === "right" ? x - w : x;
    this.page.drawText(s, { x: px, y: this.y, size, font, color: opts.color ?? INK });
    return w;
  }

  /** Wrapped paragraph; advances y. */
  para(t: string, x: number, width: number, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; leading?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const leading = opts.leading ?? size * 1.45;
    for (const raw of safe(t).split("\n")) {
      let line = "";
      for (const word of raw.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > width && line) {
          this.ensure(leading);
          this.page.drawText(line, { x, y: this.y, size, font, color: opts.color ?? INK });
          this.y -= leading;
          line = word;
        } else line = next;
      }
      this.ensure(leading);
      this.page.drawText(line, { x, y: this.y, size, font, color: opts.color ?? INK });
      this.y -= leading;
    }
  }

  rule(color = LINE, x1 = M, x2 = A4.w - M) {
    this.page.drawLine({ start: { x: x1, y: this.y }, end: { x: x2, y: this.y }, thickness: 0.75, color });
  }

  /** Brand header: logo mark, company and unit. */
  header(unitName: string, rightTitle: string) {
    this.page.drawRectangle({ x: M, y: this.y - 6, width: 22, height: 22, color: ACCENT });
    this.page.drawText("F", { x: M + 7, y: this.y, size: 13, font: this.bold, color: rgb(1, 1, 1) });
    this.text("Figuraid Ltd", M + 30, { size: 13, bold: true });
    this.y -= 13;
    this.text(unitName, M + 30, { size: 9, color: MUTED });
    this.y += 13;
    this.text(rightTitle, A4.w - M, { size: 18, bold: true, align: "right" });
    this.y -= 40;
  }

  footer(lines: string[]) {
    for (const p of this.pdf.getPages()) {
      lines.forEach((l, i) => p.drawText(safe(l), { x: M, y: 30 + (lines.length - 1 - i) * 11, size: 7.5, font: this.font, color: MUTED }));
    }
  }

  async bytes(): Promise<Uint8Array> {
    return this.pdf.save();
  }
}

export function fmtAmount(n: number, currency: string): string {
  return `${currency} ${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" }).format(d);
}
