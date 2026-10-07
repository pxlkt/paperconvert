// ─── PaperConvert format registry ───────────────────────────────────────────
// Every format PaperConvert reads or writes. Which pairs actually convert is
// decided in conversions.ts; this file only describes the formats.

export type FormatCategory = "image" | "document" | "data" | "audio" | "video";

export interface FormatInfo {
  /** canonical id, also the output extension */
  id: string;
  label: string;
  mime: string;
  /** file extensions recognised on input, lowercase, canonical first */
  extensions: string[];
  /** extra names people search for ("jpeg", "markdown"); each gets its own pages */
  aliases?: string[];
  category: FormatCategory;
  /** one plain sentence about the format, shown on its pages */
  about: string;
}

export const FORMATS: FormatInfo[] = [
  // Images
  { id: "png", label: "PNG", mime: "image/png", extensions: ["png", "apng"], category: "image", about: "PNG is a lossless image format with transparency, the usual choice for screenshots, logos and graphics." },
  { id: "jpg", label: "JPG", mime: "image/jpeg", extensions: ["jpg", "jpeg", "jfif", "jpe"], aliases: ["jpeg"], category: "image", about: "JPG (JPEG) is the lossy photo format almost every camera, phone and website understands." },
  { id: "webp", label: "WebP", mime: "image/webp", extensions: ["webp"], category: "image", about: "WebP is Google's web image format: smaller than JPG and PNG, with transparency and animation." },
  { id: "avif", label: "AVIF", mime: "image/avif", extensions: ["avif"], category: "image", about: "AVIF stores images with the AV1 codec, giving very small files for photos." },
  { id: "gif", label: "GIF", mime: "image/gif", extensions: ["gif"], category: "image", about: "GIF is the 256-colour image format behind animated reactions and memes." },
  { id: "bmp", label: "BMP", mime: "image/bmp", extensions: ["bmp", "dib"], category: "image", about: "BMP is the uncompressed Windows bitmap format, read by almost any image tool." },
  { id: "ico", label: "ICO", mime: "image/x-icon", extensions: ["ico"], category: "image", about: "ICO is the Windows icon and favicon container. PaperConvert writes 16, 32, 48, 64, 128 and 256 px sizes." },
  { id: "tiff", label: "TIFF", mime: "image/tiff", extensions: ["tiff", "tif"], aliases: ["tif"], category: "image", about: "TIFF is the lossless image format used in print, scanning and archiving." },
  { id: "svg", label: "SVG", mime: "image/svg+xml", extensions: ["svg"], category: "image", about: "SVG is a vector image format. PaperConvert rasterises it to pixels at the size you choose." },
  { id: "heic", label: "HEIC", mime: "image/heic", extensions: ["heic", "heif"], aliases: ["heif"], category: "image", about: "HEIC (HEIF) is the photo format iPhones and iPads save by default." },

  // Documents
  { id: "pdf", label: "PDF", mime: "application/pdf", extensions: ["pdf"], category: "document", about: "PDF is the fixed-layout document format for sharing and printing." },
  { id: "txt", label: "TXT", mime: "text/plain", extensions: ["txt", "text", "log"], category: "document", about: "TXT is plain text with no formatting." },
  { id: "md", label: "Markdown", mime: "text/markdown", extensions: ["md", "markdown"], aliases: ["markdown"], category: "document", about: "Markdown is plain text with light formatting marks for headings, emphasis and links." },
  { id: "html", label: "HTML", mime: "text/html", extensions: ["html", "htm"], aliases: ["htm"], category: "document", about: "HTML is the markup language web pages are written in." },

  // Spreadsheets and data
  { id: "xlsx", label: "XLSX", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extensions: ["xlsx", "xlsm"], aliases: ["excel"], category: "data", about: "XLSX is the Excel workbook format used by Microsoft Excel since 2007." },
  { id: "xls", label: "XLS", mime: "application/vnd.ms-excel", extensions: ["xls"], category: "data", about: "XLS is the older Excel 97-2003 workbook format." },
  { id: "ods", label: "ODS", mime: "application/vnd.oasis.opendocument.spreadsheet", extensions: ["ods"], category: "data", about: "ODS is the OpenDocument spreadsheet format used by LibreOffice Calc." },
  { id: "csv", label: "CSV", mime: "text/csv", extensions: ["csv"], category: "data", about: "CSV is a plain-text table with comma-separated columns." },
  { id: "tsv", label: "TSV", mime: "text/tab-separated-values", extensions: ["tsv", "tab"], category: "data", about: "TSV is a plain-text table with tab-separated columns." },
  { id: "json", label: "JSON", mime: "application/json", extensions: ["json"], category: "data", about: "JSON is the structured data format of web APIs. Tables convert as an array of row objects." },

  // Audio
  { id: "mp3", label: "MP3", mime: "audio/mpeg", extensions: ["mp3"], category: "audio", about: "MP3 is the compressed audio format every player supports." },
  { id: "wav", label: "WAV", mime: "audio/wav", extensions: ["wav", "wave"], category: "audio", about: "WAV is uncompressed audio, used for editing and production." },
  { id: "ogg", label: "OGG", mime: "audio/ogg", extensions: ["ogg", "oga"], category: "audio", about: "OGG Vorbis is an open compressed audio format." },
  { id: "flac", label: "FLAC", mime: "audio/flac", extensions: ["flac"], category: "audio", about: "FLAC is lossless compressed audio: smaller than WAV, identical sound." },
  { id: "m4a", label: "M4A", mime: "audio/mp4", extensions: ["m4a"], category: "audio", about: "M4A is AAC audio in an MP4 container, the format of Apple Music and iTunes." },
  { id: "aac", label: "AAC", mime: "audio/aac", extensions: ["aac"], category: "audio", about: "AAC is the compressed audio codec behind M4A, YouTube and most streaming." },
  { id: "opus", label: "Opus", mime: "audio/ogg; codecs=opus", extensions: ["opus"], category: "audio", about: "Opus is the open audio codec used by Discord, WhatsApp and WebRTC." },
  { id: "aiff", label: "AIFF", mime: "audio/aiff", extensions: ["aiff", "aif", "aifc"], aliases: ["aif"], category: "audio", about: "AIFF is Apple's uncompressed audio format." },
  { id: "wma", label: "WMA", mime: "audio/x-ms-wma", extensions: ["wma"], category: "audio", about: "WMA is Windows Media Audio, Microsoft's older compressed format." },

  // Video
  { id: "mp4", label: "MP4", mime: "video/mp4", extensions: ["mp4"], category: "video", about: "MP4 with H.264 is the video format that plays everywhere." },
  { id: "webm", label: "WebM", mime: "video/webm", extensions: ["webm"], category: "video", about: "WebM is the open web video format with VP8 or VP9 video." },
  { id: "mov", label: "MOV", mime: "video/quicktime", extensions: ["mov", "qt"], category: "video", about: "MOV is Apple's QuickTime video format, saved by iPhones and Macs." },
  { id: "mkv", label: "MKV", mime: "video/x-matroska", extensions: ["mkv"], category: "video", about: "MKV (Matroska) is a flexible container that holds almost any video and audio codec." },
  { id: "avi", label: "AVI", mime: "video/x-msvideo", extensions: ["avi"], category: "video", about: "AVI is the classic Windows video container." },
  { id: "m4v", label: "M4V", mime: "video/x-m4v", extensions: ["m4v"], category: "video", about: "M4V is Apple's MP4 variant used by iTunes video." },
  { id: "flv", label: "FLV", mime: "video/x-flv", extensions: ["flv"], category: "video", about: "FLV is the Flash video format of older web players." },
  { id: "wmv", label: "WMV", mime: "video/x-ms-wmv", extensions: ["wmv"], category: "video", about: "WMV is Windows Media Video, Microsoft's older video format." },
  { id: "3gp", label: "3GP", mime: "video/3gpp", extensions: ["3gp", "3g2"], category: "video", about: "3GP is the video format of older mobile phones." },
  { id: "mpeg", label: "MPEG", mime: "video/mpeg", extensions: ["mpeg", "mpg"], aliases: ["mpg"], category: "video", about: "MPEG is the MPEG-1/MPEG-2 video format of DVDs and older camcorders." },
];

const BY_ID = new Map(FORMATS.map((f) => [f.id, f]));
const BY_EXTENSION = new Map<string, FormatInfo>();
for (const f of FORMATS) for (const ext of f.extensions) BY_EXTENSION.set(ext, f);
// mime types browsers report that differ from the canonical one above
const EXTRA_MIMES: Record<string, string> = {
  "image/jpg": "jpg",
  "image/x-ms-bmp": "bmp",
  "image/vnd.microsoft.icon": "ico",
  "image/heif": "heic",
  "audio/mp3": "mp3",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/x-flac": "flac",
  "audio/x-m4a": "m4a",
  "audio/x-aiff": "aiff",
  "video/x-matroska": "mkv",
};

export function formatById(id: string): FormatInfo | undefined {
  return BY_ID.get(id);
}

export function getFormat(id: string): FormatInfo {
  const f = BY_ID.get(id);
  if (!f) throw new Error(`Unknown format "${id}".`);
  return f;
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** Detects by extension first (what the user sees), then by mime type. */
export function detectFormat(file: { name: string; type: string }): FormatInfo | undefined {
  const byExt = BY_EXTENSION.get(extensionOf(file.name));
  if (byExt) return byExt;
  const type = file.type.toLowerCase().split(";")[0]!.trim();
  if (!type) return undefined;
  return FORMATS.find((f) => f.mime.split(";")[0] === type) ?? BY_ID.get(EXTRA_MIMES[type] ?? "");
}

export function mimeFor(id: string): string {
  return BY_ID.get(id)?.mime ?? "application/octet-stream";
}

/** Every extension PaperConvert reads, for the file picker's accept list. */
export const ACCEPT = FORMATS.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(",");
