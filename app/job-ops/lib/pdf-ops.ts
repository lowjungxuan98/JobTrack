import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { renderHtmlToPdf } from "../pdf/generate-pdf";

export async function renderPdf(
  htmlPath: string,
  pdfPath: string,
  paperFormat: "a4" | "letter",
): Promise<boolean> {
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  try {
    await renderHtmlToPdf(htmlPath, pdfPath, paperFormat);
    return true;
  } catch (e) {
    process.stderr.write(`render failed: ${(e as Error).message}\n`);
    return false;
  }
}

export async function mergePdfs(sources: string[], outputPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const merged = await PDFDocument.create();
  for (const source of sources) {
    const bytes = fs.readFileSync(source);
    const src = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  const out = await merged.save();
  fs.writeFileSync(outputPath, out);
}
