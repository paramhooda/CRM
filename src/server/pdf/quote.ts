import "server-only";
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { QuoteLine } from "@/domain/quote";
import { inrPlain } from "@/domain/quote";

export type QuotePdfData = {
  quoteNo: string;
  revision: number;
  date: string;
  validUntil: string;
  company: { name: string; addressLines: string[]; gstin: string | null; phone: string | null; email: string | null; website: string | null; terms: string | null };
  customer: { name: string; addressLines: string[]; gstin: string | null; contact: string | null };
  deal: { code: string; name: string };
  lines: QuoteLine[];
  subtotal: string;
  notes: string | null;
  sender: { name: string; title: string | null; email: string };
};

const LOGO = path.join(process.cwd(), "public", "brand", "progression-logo.png");
const GREY = "#71717a";
const INK = "#09090b";
const RULE = "#e5e7eb";

/** An A4 quotation in the built-in Helvetica: header, parties, lines, subtotal, terms, signature. Returns the PDF bytes. */
export function renderQuotePdf(q: QuotePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Quotation ${q.quoteNo}`, Author: q.company.name } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // Header: logo or name, quote number block on the right
    let y = doc.y;
    if (fs.existsSync(LOGO)) doc.image(LOGO, left, y, { height: 28 });
    else doc.font("Helvetica-Bold").fontSize(18).fillColor(INK).text(q.company.name, left, y);
    doc.font("Helvetica-Bold").fontSize(16).fillColor(INK).text("QUOTATION", left + width / 2, y, { width: width / 2, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor(GREY).text(`${q.quoteNo}${q.revision > 1 ? `  ·  revision ${q.revision}` : ""}`, left + width / 2, y + 20, { width: width / 2, align: "right" });
    doc.text(`Date ${q.date}  ·  Valid until ${q.validUntil}`, left + width / 2, y + 32, { width: width / 2, align: "right" });
    y += 56;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(RULE).stroke();
    y += 14;

    // Parties
    const block = (x: number, title: string, lines: string[]) => {
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GREY).text(title.toUpperCase(), x, y, { width: width / 2 - 12, characterSpacing: 0.6 });
      doc.font("Helvetica").fontSize(9.5).fillColor(INK);
      let yy = y + 14;
      for (const l of lines.filter(Boolean)) {
        doc.text(l, x, yy, { width: width / 2 - 12 });
        yy = doc.y + 1;
      }
      return yy;
    };
    const fromEnd = block(left, "From", [q.company.name, ...q.company.addressLines, q.company.gstin ? `GSTIN ${q.company.gstin}` : "", [q.company.phone, q.company.email, q.company.website].filter(Boolean).join("  ·  ")]);
    const toEnd = block(left + width / 2, "To", [q.customer.name, ...q.customer.addressLines, q.customer.gstin ? `GSTIN ${q.customer.gstin}` : "", q.customer.contact ? `Attn: ${q.customer.contact}` : ""]);
    y = Math.max(fromEnd, toEnd) + 10;
    doc.font("Helvetica").fontSize(9.5).fillColor(GREY).text(`Subject: Quotation for ${q.deal.name} (ref. ${q.deal.code})`, left, y, { width });
    y = doc.y + 14;

    // Lines table
    const cols = [{ k: "no", w: 24, align: "left" as const }, { k: "desc", w: width - 24 - 64 - 56 - 90 - 96, align: "left" as const }, { k: "hsn", w: 64, align: "left" as const }, { k: "qty", w: 56, align: "right" as const }, { k: "unit", w: 90, align: "right" as const }, { k: "amount", w: 96, align: "right" as const }];
    const head = { no: "#", desc: "Description", hsn: "HSN/SAC", qty: "Qty", unit: "Unit price (INR)", amount: "Amount (INR)" } as const;
    const row = (cells: Record<string, string>, bold = false, sub?: string) => {
      let x = left;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(INK);
      const heights: number[] = [];
      for (const c of cols) {
        const text = cells[c.k] ?? "";
        heights.push(doc.heightOfString(text, { width: c.w - 6 }));
      }
      const h = Math.max(...heights, 12) + (sub ? 11 : 0) + 8;
      if (y + h > doc.page.height - doc.page.margins.bottom - 120) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      x = left;
      for (const c of cols) {
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(INK).text(cells[c.k] ?? "", x + (c.align === "right" ? 0 : 3), y + 4, { width: c.w - 6, align: c.align });
        x += c.w;
      }
      if (sub) doc.font("Helvetica").fontSize(8).fillColor(GREY).text(sub, left + cols[0]!.w + 3, y + 4 + heights[1]! + 1, { width: cols[1]!.w - 6 });
      y += h;
      doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(RULE).stroke();
    };
    doc.rect(left, y, width, 20).fill("#f4f4f5");
    doc.fillColor(INK);
    row(head, true);
    for (const l of q.lines) row({ no: String(l.lineNo), desc: l.description, hsn: l.hsnSac, qty: `${l.quantity} ${l.unit}`, unit: inrPlain(l.unitPrice), amount: inrPlain(l.amount) }, false, l.model === "One-time" ? undefined : l.model);
    y += 6;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text("Total (INR, excluding GST)", left, y, { width: width - 96, align: "right" });
    doc.text(inrPlain(q.subtotal), right - 96, y, { width: 96, align: "right" });
    y = doc.y + 4;
    doc.font("Helvetica").fontSize(8.5).fillColor(GREY).text("All amounts are in Indian Rupees and exclusive of GST, which is extra as applicable.", left, y, { width, align: "right" });
    y = doc.y + 16;

    // Notes and terms
    const para = (title: string, text: string | null) => {
      if (!text) return;
      if (y > doc.page.height - doc.page.margins.bottom - 140) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GREY).text(title.toUpperCase(), left, y, { characterSpacing: 0.6 });
      doc.font("Helvetica").fontSize(9).fillColor(INK).text(text, left, doc.y + 3, { width });
      y = doc.y + 12;
    };
    para("Notes", q.notes);
    para("Terms", q.company.terms);

    // Signature
    if (y > doc.page.height - doc.page.margins.bottom - 70) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    doc.font("Helvetica").fontSize(9).fillColor(GREY).text(`For ${q.company.name}`, left, y + 8);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(q.sender.name, left, doc.y + 18);
    doc.font("Helvetica").fontSize(9).fillColor(GREY).text([q.sender.title, q.sender.email].filter(Boolean).join("  ·  "), left, doc.y + 1);
    doc.end();
  });
}
