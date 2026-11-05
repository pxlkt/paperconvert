// ─── Conversion dispatcher ──────────────────────────────────────────────────
// Looks the pair up in the conversion table and runs its engine. A pair that
// is not in the table is refused here, whatever the UI offered.

import { findConversion } from "./conversions";
import { ConversionError, type Progress } from "./errors";
import { getFormat, mimeFor } from "./formats";
import { sanitizeOptions, type ConvertOptions } from "./options";
import { outputFileName } from "./bytes";

export interface ConvertResult {
  blob: Blob;
  fileName: string;
  width?: number;
  height?: number;
  warnings: string[];
  elapsedMs: number;
}

export async function convertFile(
  file: File,
  from: string,
  to: string,
  rawOptions: ConvertOptions,
  progress: Progress,
): Promise<ConvertResult> {
  const conversion = findConversion(from, to);
  if (!conversion) {
    throw new ConversionError(`PaperConvert does not convert ${getFormat(from).label} to ${getFormat(to).label}.`);
  }
  const opts = sanitizeOptions(rawOptions);
  const started = performance.now();
  let out: Omit<ConvertResult, "elapsedMs" | "fileName"> & { fileName?: string };

  // each engine loads the first time a file needs it, so the page itself
  // ships without pdf.js, SheetJS, pdf-lib or FFmpeg
  switch (conversion.engine) {
    case "image": {
      const { convertImage } = await loadEngine(() => import("./imageEngine"));
      out = { ...(await convertImage(file, from, to, opts, progress)), warnings: [] };
      break;
    }
    case "media": {
      const { runMedia } = await loadEngine(() => import("./ffmpeg"));
      out = { blob: await runMedia(file, from, to, opts, progress), warnings: [] };
      break;
    }
    case "pdf": {
      const { convertPdf } = await loadEngine(() => import("./pdfEngine"));
      out = await convertPdf(file, to, opts, progress);
      break;
    }
    case "text": {
      const { convertText } = await loadEngine(() => import("./textEngine"));
      out = await convertText(file, from, to);
      break;
    }
    case "sheet": {
      const { convertSheet } = await loadEngine(() => import("./sheetEngine"));
      out = await convertSheet(file, from, to);
      break;
    }
  }
  const blob = out.blob.type ? out.blob : new Blob([out.blob], { type: mimeFor(to) });
  return {
    ...out,
    blob,
    fileName: out.fileName ?? outputFileName(file.name, to),
    elapsedMs: performance.now() - started,
  };
}

/** A failed engine download (offline, a new deploy) is an error on the file's row, not a silent stall. */
async function loadEngine<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (err) {
    throw new ConversionError(
      `The converter for this file failed to load. Check your connection and reload the page. (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}
