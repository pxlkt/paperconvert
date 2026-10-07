// ─── Conversion table ───────────────────────────────────────────────────────
// The one list of conversions PaperConvert performs. The target picker, the
// engine dispatcher and every /x-to-y page are derived from it, so a pair is
// offered, routed and published only if an engine actually runs it.

import { formatById, getFormat, type FormatInfo } from "./formats";

/**
 * image: decode to a canvas, encode in-page (canvas, gifenc, BMP/TIFF/ICO writers, pdf-lib)
 * media: FFmpeg compiled to WebAssembly
 * pdf:   pdf.js renders or extracts the pages
 * text:  Markdown / HTML / text rewriting, pdf-lib for PDF output
 * sheet: SheetJS workbooks
 */
export type Engine = "image" | "media" | "pdf" | "text" | "sheet";

export interface Conversion {
  from: string;
  to: string;
  engine: Engine;
}

const IMAGE_IN = ["png", "jpg", "webp", "avif", "gif", "bmp", "ico", "tiff", "svg", "heic"];
const IMAGE_OUT = ["png", "jpg", "webp", "gif", "bmp", "tiff", "ico", "pdf"];
const TEXT = ["txt", "md", "html"];
const SHEET_IN = ["xlsx", "xls", "ods", "csv", "tsv", "json"];
const SHEET_OUT = [...SHEET_IN, "html"];
const AUDIO_IN = ["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus", "aiff", "wma"];
const AUDIO_OUT = ["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus", "aiff", "wma"];
const VIDEO_IN = ["mp4", "webm", "mov", "mkv", "avi", "m4v", "flv", "wmv", "3gp", "mpeg"];
const VIDEO_OUT = ["mp4", "webm", "mov", "mkv", "avi", "gif"];
const VIDEO_AUDIO_OUT = ["mp3", "wav", "m4a", "aac", "ogg", "flac", "opus"];
const FRAME_OUT = ["png", "jpg", "webp"];

function build(): Conversion[] {
  const out: Conversion[] = [];
  const add = (from: string, tos: string[], engine: Engine) => {
    for (const to of tos) {
      if (out.some((c) => c.from === from && c.to === to)) continue;
      out.push({ from, to, engine });
    }
  };

  // An animated GIF keeps its frames when FFmpeg handles it: GIF to GIF
  // (resized), to animated WebP, and to video. Everything else takes the
  // first frame through the canvas.
  add("gif", ["gif", "webp", "mp4", "webm"], "media");
  // Images re-encode to their own format too (resize or recompress).
  for (const from of IMAGE_IN) add(from, IMAGE_OUT, "image");

  add("pdf", ["png", "jpg", "webp", "txt"], "pdf");
  for (const from of TEXT) add(from, [...TEXT.filter((t) => t !== from), "pdf"], "text");
  for (const from of SHEET_IN) add(from, SHEET_OUT.filter((t) => t !== from), "sheet");

  for (const from of AUDIO_IN) add(from, AUDIO_OUT.filter((t) => t !== from), "media");
  for (const from of VIDEO_IN) {
    add(from, [...VIDEO_OUT, ...VIDEO_AUDIO_OUT, ...FRAME_OUT].filter((t) => t !== from), "media");
  }
  return out;
}

export const CONVERSIONS: readonly Conversion[] = build();

export function findConversion(from: string, to: string): Conversion | undefined {
  return CONVERSIONS.find((c) => c.from === from && c.to === to);
}

export function targetsFor(from: string): FormatInfo[] {
  return CONVERSIONS.filter((c) => c.from === from).map((c) => getFormat(c.to));
}

export function sourcesFor(to: string): FormatInfo[] {
  return CONVERSIONS.filter((c) => c.to === to && c.from !== to).map((c) => getFormat(c.from));
}

const DEFAULT_TARGET: Record<string, string> = {
  png: "jpg", jpg: "png", webp: "png", avif: "jpg", gif: "mp4", bmp: "png", ico: "png", tiff: "jpg", svg: "png", heic: "jpg",
  pdf: "jpg", txt: "pdf", md: "html", html: "md",
  xlsx: "csv", xls: "xlsx", ods: "xlsx", csv: "xlsx", tsv: "csv", json: "csv",
  mp3: "wav", wav: "mp3", ogg: "mp3", flac: "mp3", m4a: "mp3", aac: "mp3", opus: "mp3", aiff: "mp3", wma: "mp3",
  mp4: "gif", webm: "mp4", mov: "mp4", mkv: "mp4", avi: "mp4", m4v: "mp4", flv: "mp4", wmv: "mp4", "3gp": "mp4", mpeg: "mp4",
};

/** The target a new file starts on: the page's target if this file can reach it, else the format's usual pick. */
export function defaultTarget(from: string, preferred?: string): string {
  if (preferred && findConversion(from, preferred)) return preferred;
  const usual = DEFAULT_TARGET[from];
  if (usual && findConversion(from, usual)) return usual;
  const first = CONVERSIONS.find((c) => c.from === from);
  if (!first) throw new Error(`No conversion reads ${formatById(from)?.label ?? from}.`);
  return first.to;
}
