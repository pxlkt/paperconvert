// ─── PDF engine ─────────────────────────────────────────────────────────────
// pdf.js renders each page to a canvas (then the image engine encodes it) or
// extracts its text. More than one page of images comes back as a ZIP.

import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { zipSync } from "fflate";
import { encodeImage } from "./imageEngine";
import { ConversionError, type Progress } from "./errors";
import { LIMITS, type ConvertOptions } from "./options";
import { baseName, formatBytes, outputFileName } from "./bytes";

GlobalWorkerOptions.workerSrc = workerUrl;

async function openPdf(file: File): Promise<{ pdf: PDFDocumentProxy; task: PDFDocumentLoadingTask }> {
  if (file.size > LIMITS.maxDocumentBytes) {
    throw new ConversionError(`This PDF is ${formatBytes(file.size)}. PaperConvert reads PDFs up to ${formatBytes(LIMITS.maxDocumentBytes)}.`);
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const task = getDocument({ data });
  try {
    return { pdf: await task.promise, task };
  } catch (err) {
    await task.destroy();
    const name = err instanceof Error ? err.name : "";
    if (name === "PasswordException") throw new ConversionError("This PDF is password-protected. Remove the password, then convert it.");
    throw new ConversionError(`This PDF could not be opened (${err instanceof Error ? err.message : String(err)}).`);
  }
}

export interface PdfResult {
  blob: Blob;
  /** set when the output is not `<name>.<target>`, e.g. a ZIP of pages */
  fileName?: string;
  width?: number;
  height?: number;
  warnings: string[];
}

export async function convertPdf(file: File, to: string, opts: ConvertOptions, progress: Progress): Promise<PdfResult> {
  const { pdf, task } = await openPdf(file);
  try {
    if (to === "txt") return { blob: await extractText(pdf, progress), warnings: [] };
    if (pdf.numPages > LIMITS.maxPdfPages) {
      throw new ConversionError(`This PDF has ${pdf.numPages} pages. PaperConvert renders up to ${LIMITS.maxPdfPages} pages to images.`);
    }
    const scale = opts.pdfDpi / 72;
    const files: Record<string, Uint8Array> = {};
    let last: { blob: Blob; width: number; height: number } | null = null;
    const pad = String(pdf.numPages).length;
    for (let n = 1; n <= pdf.numPages; n++) {
      progress.stage(`page ${n} of ${pdf.numPages}`);
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      if (canvas.width * canvas.height > LIMITS.maxPixels) {
        throw new ConversionError(`Page ${n} at ${opts.pdfDpi} DPI is over the ${LIMITS.maxPixels / 1_000_000} megapixel limit. Pick a lower DPI.`);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new ConversionError("This browser could not create a drawing surface.");
      // pages are drawn on white, like paper; JPG uses the chosen background
      ctx.fillStyle = to === "jpg" ? opts.background : "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      page.cleanup();
      const img = await encodeImage(
        { source: canvas, width: canvas.width, height: canvas.height, close: () => undefined },
        to,
        { ...opts, resizeMode: "original" },
        progress,
      );
      last = img;
      if (pdf.numPages > 1) {
        files[`${baseName(file.name)}-page-${String(n).padStart(pad, "0")}.${to}`] = new Uint8Array(await img.blob.arrayBuffer());
      }
      progress.ratio(n / pdf.numPages);
    }
    if (!last) throw new ConversionError("This PDF has no pages.");
    if (pdf.numPages === 1) return { ...last, warnings: [] };
    // already-compressed images: store, don't deflate again
    const zip = zipSync(files, { level: 0 });
    return {
      blob: new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }),
      fileName: outputFileName(file.name, `${to}.zip`),
      warnings: [],
    };
  } finally {
    // ends the pdf.js worker's hold on this document
    await task.destroy();
  }
}

async function extractText(pdf: PDFDocumentProxy, progress: Progress): Promise<Blob> {
  const pages: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      text += item.str + (item.hasEOL ? "\n" : "");
    }
    pages.push(text.trim());
    page.cleanup();
    progress.ratio(n / pdf.numPages);
  }
  const all = pages.join("\n\n");
  if (!all.trim()) {
    throw new ConversionError("This PDF has no text layer (it is probably scanned images). Convert it to PNG or JPG instead.");
  }
  return new Blob([all], { type: "text/plain;charset=utf-8" });
}
