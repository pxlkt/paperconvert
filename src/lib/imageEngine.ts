// ─── Image engine ───────────────────────────────────────────────────────────
// Decodes any supported image to pixels in the page (createImageBitmap, an
// <img> for SVG, heic-decode, UTIF), then encodes the target: canvas for
// PNG/JPG/WebP, gifenc for GIF, the writers in encoders.ts for BMP/ICO, UTIF
// for TIFF, pdf-lib for PDF. Every encoder's output type is checked: a canvas
// that cannot write a format returns PNG instead of failing.

import UTIF from "utif";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { encodeBmp, encodeIco, hasAlpha, icoSizesFor } from "./encoders";
import { ConversionError, type Progress } from "./errors";
import { DEFAULT_OPTIONS, LIMITS, computeOutputSize, type ConvertOptions } from "./options";
import { formatBytes } from "./bytes";
import { mimeFor } from "./formats";
import { runMedia } from "./ffmpeg";

export interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

function canvasFromRgba(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ConversionError("This browser could not create a drawing surface.");
  const data = ctx.createImageData(width, height);
  data.data.set(rgba);
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ConversionError("This browser could not read the image."));
    img.src = url;
  });
}

/** SVGs without width/height report no natural size; take it from the viewBox. */
export function svgIntrinsicSize(svgText: string): { w: number; h: number } | null {
  const root = /<svg\b[^>]*>/i.exec(svgText)?.[0];
  if (!root) return null;
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(root)?.[1];
  const num = (v: string | undefined) => (v && /^\s*[\d.]+\s*(px)?\s*$/.test(v) ? parseFloat(v) : NaN);
  const w = num(attr("width"));
  const h = num(attr("height"));
  if (w > 0 && h > 0) return { w, h };
  const vb = attr("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (vb && vb.length === 4 && vb[2]! > 0 && vb[3]! > 0) {
    const scale = 1024 / Math.max(vb[2]!, vb[3]!);
    return { w: Math.round(vb[2]! * scale), h: Math.round(vb[3]! * scale) };
  }
  return null;
}

export async function decodeImage(file: Blob, from: string): Promise<DecodedImage> {
  if (file.size > LIMITS.maxImageBytes) {
    throw new ConversionError(`This image is ${formatBytes(file.size)}. PaperConvert reads images up to ${formatBytes(LIMITS.maxImageBytes)}.`);
  }
  if (from === "heic") {
    // libheif is most of this engine's weight, so only HEIC files fetch it
    const { default: decodeHeic } = await import("heic-decode");
    const { width, height, data } = await decodeHeic({ buffer: new Uint8Array(await file.arrayBuffer()) });
    const canvas = canvasFromRgba(data, width, height);
    return { source: canvas, width, height, close: () => undefined };
  }
  if (from === "tiff") {
    const buf = await file.arrayBuffer();
    const ifds = UTIF.decode(buf);
    const first = ifds[0];
    if (!first) throw new ConversionError("This TIFF has no image in it.");
    UTIF.decodeImage(buf, first);
    const canvas = canvasFromRgba(UTIF.toRGBA8(first), first.width, first.height);
    return { source: canvas, width: first.width, height: first.height, close: () => undefined };
  }
  if (from === "svg") {
    const text = await file.text();
    const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
    try {
      const img = await loadImageElement(url);
      const size = img.naturalWidth > 0 && img.naturalHeight > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : svgIntrinsicSize(text);
      if (!size) throw new ConversionError("This SVG has no width, height or viewBox, so it has no size to draw at.");
      return { source: img, width: size.w, height: size.h, close: () => URL.revokeObjectURL(url) };
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }
  // PNG, JPG, WebP, AVIF, GIF (first frame), BMP, ICO: the browser's decoders,
  // which also apply EXIF orientation
  const bmp = await createImageBitmap(file).catch((err: unknown) => {
    throw new ConversionError(`This browser could not decode the image (${err instanceof Error ? err.message : String(err)}).`);
  });
  return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
}

function draw(img: DecodedImage, w: number, h: number, background?: string): HTMLCanvasElement {
  if (w * h > LIMITS.maxPixels) {
    throw new ConversionError(`${w}×${h} is larger than the ${LIMITS.maxPixels / 1_000_000} megapixel limit. Pick a smaller size.`);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new ConversionError("This browser could not create a drawing surface that large.");
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img.source, 0, 0, w, h);
  return canvas;
}

function pixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  return canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data;
}

/** canvas.toBlob, refusing a substituted format instead of mislabelling it. */
export function canvasBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b && b.type === mime ? b : null), mime, quality);
  });
}

async function encodeCanvas(canvas: HTMLCanvasElement, to: "png" | "jpg" | "webp", quality: number, progress: Progress): Promise<Blob> {
  const mime = mimeFor(to);
  const blob = await canvasBlob(canvas, mime, to === "png" ? undefined : quality / 100);
  if (blob) return blob;
  if (to !== "webp") throw new ConversionError(`This browser cannot write ${to.toUpperCase()} images.`);
  // Safari's canvas has no WebP encoder: hand a lossless PNG to FFmpeg's libwebp
  const png = await canvasBlob(canvas, "image/png");
  if (!png) throw new ConversionError("This browser could not encode the image.");
  return runMedia(new File([png], "frame.png", { type: "image/png" }), "png", "webp", { ...DEFAULT_OPTIONS, quality }, progress);
}

function encodeStillGif(rgba: Uint8ClampedArray, w: number, h: number, colors: number): Blob {
  const transparent = hasAlpha(rgba);
  const format = transparent ? "rgba4444" : "rgb565";
  const palette = quantize(rgba, colors, transparent ? { format, oneBitAlpha: true } : { format });
  const index = applyPalette(rgba, palette, format);
  const transparentIndex = transparent ? palette.findIndex((c) => c[3] === 0) : -1;
  const gif = GIFEncoder();
  gif.writeFrame(index, w, h, {
    palette,
    ...(transparentIndex >= 0 ? { transparent: true, transparentIndex } : {}),
  });
  gif.finish();
  return new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], { type: "image/gif" });
}

async function encodeIcon(img: DecodedImage): Promise<Blob> {
  const images = [];
  for (const size of icoSizesFor(img.width, img.height)) {
    // letterbox into a square so non-square sources keep their shape
    const scale = size / Math.max(img.width, img.height);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ConversionError("This browser could not create a drawing surface.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img.source, Math.floor((size - w) / 2), Math.floor((size - h) / 2), w, h);
    const png = await canvasBlob(canvas, "image/png");
    if (!png) throw new ConversionError("This browser could not encode an icon size.");
    images.push({ size, png: new Uint8Array(await png.arrayBuffer()) });
  }
  return new Blob([encodeIco(images) as Uint8Array<ArrayBuffer>], { type: "image/x-icon" });
}

async function encodePdf(canvas: HTMLCanvasElement): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  // photos embed as JPEG; anything with transparency keeps it as PNG
  const transparent = hasAlpha(pixels(canvas));
  const bytes = await canvasBlob(canvas, transparent ? "image/png" : "image/jpeg", 0.92);
  if (!bytes) throw new ConversionError("This browser could not encode the page image.");
  const data = new Uint8Array(await bytes.arrayBuffer());
  const embedded = transparent ? await doc.embedPng(data) : await doc.embedJpg(data);
  // the page takes the image's shape, scaled to fit an A4 sheet either way up
  const portrait = canvas.height >= canvas.width;
  const [maxW, maxH] = portrait ? [595.28, 841.89] : [841.89, 595.28];
  const scale = Math.min(maxW / canvas.width, maxH / canvas.height, 1);
  const page = doc.addPage([canvas.width * scale, canvas.height * scale]);
  page.drawImage(embedded, { x: 0, y: 0, width: canvas.width * scale, height: canvas.height * scale });
  return new Blob([(await doc.save()) as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
}

export interface ImageResult {
  blob: Blob;
  width: number;
  height: number;
}

/** Encodes an already-decoded image. Used for image files and for rendered PDF pages. */
export async function encodeImage(img: DecodedImage, to: string, opts: ConvertOptions, progress: Progress): Promise<ImageResult> {
  if (to === "ico") {
    const sizes = icoSizesFor(img.width, img.height);
    return { blob: await encodeIcon(img), width: sizes[sizes.length - 1]!, height: sizes[sizes.length - 1]! };
  }
  const { w, h } = computeOutputSize(img.width, img.height, opts);
  const flatten = to === "jpg" || to === "bmp";
  const canvas = draw(img, w, h, flatten ? opts.background : undefined);
  progress.ratio(0.5);
  let blob: Blob;
  switch (to) {
    case "png":
    case "jpg":
    case "webp":
      blob = await encodeCanvas(canvas, to, opts.quality, progress);
      break;
    case "bmp":
      blob = new Blob([encodeBmp(pixels(canvas), w, h) as Uint8Array<ArrayBuffer>], { type: "image/bmp" });
      break;
    case "tiff":
      blob = new Blob([UTIF.encodeImage(new Uint8Array(pixels(canvas).buffer), w, h)], { type: "image/tiff" });
      break;
    case "gif":
      blob = encodeStillGif(pixels(canvas), w, h, opts.gifColors);
      break;
    case "pdf":
      blob = await encodePdf(canvas);
      break;
    default:
      throw new ConversionError(`The image engine cannot write ${to}.`);
  }
  return { blob, width: w, height: h };
}

export async function convertImage(file: File, from: string, to: string, opts: ConvertOptions, progress: Progress): Promise<ImageResult> {
  progress.stage("decode");
  const img = await decodeImage(file, from);
  try {
    progress.stage("encode");
    return await encodeImage(img, to, opts, progress);
  } finally {
    img.close();
  }
}
