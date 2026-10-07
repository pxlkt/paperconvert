// ─── Conversion dispatcher ──────────────────────────────────────────────────
// Looks the pair up in the conversion table and runs its engine. A pair that
// is not in the table is refused here, whatever the UI offered.

import { findConversion } from "./conversions";
import { ConversionError, type Progress } from "./errors";
import { getFormat, mimeFor } from "./formats";
import { sanitizeOptions, type ConvertOptions } from "./options";
import { outputFileName } from "./bytes";
import { convertImage } from "./imageEngine";
import { runMedia } from "./ffmpeg";
import { convertPdf } from "./pdfEngine";
import { convertText } from "./textEngine";
import { convertSheet } from "./sheetEngine";

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

  switch (conversion.engine) {
    case "image":
      out = { ...(await convertImage(file, from, to, opts, progress)), warnings: [] };
      break;
    case "media":
      out = { blob: await runMedia(file, from, to, opts, progress), warnings: [] };
      break;
    case "pdf":
      out = await convertPdf(file, to, opts, progress);
      break;
    case "text":
      out = await convertText(file, from, to);
      break;
    case "sheet":
      out = await convertSheet(file, from, to);
      break;
  }
  const blob = out.blob.type ? out.blob : new Blob([out.blob], { type: mimeFor(to) });
  return {
    ...out,
    blob,
    fileName: out.fileName ?? outputFileName(file.name, to),
    elapsedMs: performance.now() - started,
  };
}
