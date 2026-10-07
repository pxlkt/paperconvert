// ─── Conversion options ─────────────────────────────────────────────────────
// What the user can tune, and which of it applies to a given conversion. The
// options dialog shows only applicable settings, and each engine reads only
// the ones listed for its pair, so no setting is shown that nothing honours.

import { findConversion } from "./conversions";
import { getFormat } from "./formats";

export type ResizeMode = "original" | "width" | "height" | "exact" | "percent";

export interface ConvertOptions {
  /** 1..100: image quality, audio bitrate tier, or video quality */
  quality: number;
  resizeMode: ResizeMode;
  width?: number;
  height?: number;
  percent?: number;
  /** fills transparency for formats without alpha */
  background: string;
  /** shareable GIF preset: at most 480 px wide, 15 fps, 128 colours */
  shareableGif: boolean;
  gifFps: number;
  gifColors: number;
  /** 0 keeps the source frame rate */
  videoFps: number;
  muteAudio: boolean;
  /** copy compatible video and audio streams instead of re-encoding */
  copyStreams: boolean;
  /** render resolution for PDF pages */
  pdfDpi: number;
}

export const DEFAULT_OPTIONS: ConvertOptions = {
  quality: 85,
  resizeMode: "original",
  background: "#ffffff",
  shareableGif: true,
  gifFps: 15,
  gifColors: 256,
  videoFps: 0,
  muteAudio: false,
  copyStreams: true,
  pdfDpi: 150,
};

export const LIMITS = {
  /** largest output image, in pixels; browsers refuse larger canvases */
  maxPixels: 100_000_000,
  resizeMax: 16_000,
  percentMax: 400,
  /** FFmpeg reads input in place, but output lives in WebAssembly memory */
  maxMediaBytes: 2 * 1024 ** 3,
  maxImageBytes: 512 * 1024 ** 2,
  maxDocumentBytes: 256 * 1024 ** 2,
  maxSheetBytes: 256 * 1024 ** 2,
  maxPdfPages: 500,
  /** files waiting in the queue at once */
  maxQueue: 200,
};

export type OptionGroup = "quality" | "resize" | "background" | "gif" | "fps" | "mute" | "copy" | "pdf";

const LOSSY_AUDIO = new Set(["mp3", "ogg", "m4a", "aac", "opus", "wma"]);
const VIDEO_OUT = new Set(["mp4", "webm", "mov", "mkv", "avi"]);
/** sources whose streams usually fit an MP4/MOV container without re-encoding */
const MP4_FAMILY = new Set(["mp4", "mov", "m4v", "3gp"]);

/** Whether this pair can try a stream copy before re-encoding. */
export function canCopyStreams(from: string, to: string): boolean {
  if (to === "mkv") return getFormat(from).category === "video";
  return (to === "mp4" || to === "mov") && MP4_FAMILY.has(from);
}

export function optionGroups(from: string, to: string, opts?: ConvertOptions): OptionGroup[] {
  const c = findConversion(from, to);
  if (!c) return [];
  const groups: OptionGroup[] = [];
  const copying = opts?.copyStreams !== false && canCopyStreams(from, to);
  if (c.engine === "image") {
    if (to === "jpg" || to === "webp") groups.push("quality");
    if (to !== "ico") groups.push("resize");
    if (to === "jpg" || to === "bmp") groups.push("background");
    if (to === "gif") groups.push("gif");
  } else if (c.engine === "pdf") {
    if (to !== "txt") {
      if (to !== "png") groups.push("quality");
      groups.push("pdf");
      if (to === "jpg") groups.push("background");
    }
  } else if (c.engine === "media") {
    if (to === "gif") {
      groups.push("gif");
      if (!opts?.shareableGif) groups.push("resize");
    } else if (VIDEO_OUT.has(to)) {
      if (canCopyStreams(from, to)) groups.push("copy");
      // a stream copy keeps the source frames: only dropping audio still applies
      if (!copying) groups.push("quality", "resize", "fps");
      groups.push("mute");
    } else if (to === "png" || to === "jpg" || to === "webp") {
      if (to !== "png") groups.push("quality");
      groups.push("resize");
    } else if (LOSSY_AUDIO.has(to)) {
      groups.push("quality");
    }
  }
  return groups;
}

/** Clamps every numeric option into its valid range. The engines call this; the dialog is not the boundary. */
export function sanitizeOptions(o: ConvertOptions): ConvertOptions {
  const int = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const optional = (v: number | undefined, max: number) =>
    v === undefined || !Number.isFinite(v) || v < 1 ? undefined : Math.min(max, Math.round(v));
  return {
    ...o,
    quality: int(o.quality, 1, 100, DEFAULT_OPTIONS.quality),
    width: optional(o.width, LIMITS.resizeMax),
    height: optional(o.height, LIMITS.resizeMax),
    percent: optional(o.percent, LIMITS.percentMax),
    background: /^#[0-9a-f]{6}$/i.test(o.background) ? o.background : DEFAULT_OPTIONS.background,
    gifFps: int(o.gifFps, 1, 50, DEFAULT_OPTIONS.gifFps),
    gifColors: int(o.gifColors, 2, 256, DEFAULT_OPTIONS.gifColors),
    videoFps: int(o.videoFps, 0, 120, 0),
    pdfDpi: int(o.pdfDpi, 36, 600, DEFAULT_OPTIONS.pdfDpi),
  };
}

/** Output size for a resize setting; never smaller than 1x1. */
export function computeOutputSize(srcW: number, srcH: number, opts: ConvertOptions): { w: number; h: number } {
  const { resizeMode, width, height, percent } = opts;
  const r = (n: number) => Math.max(1, Math.round(n));
  if (resizeMode === "percent" && percent) return { w: r((srcW * percent) / 100), h: r((srcH * percent) / 100) };
  if (resizeMode === "width" && width) return { w: r(width), h: r((srcH * width) / srcW) };
  if (resizeMode === "height" && height) return { w: r((srcW * height) / srcH), h: r(height) };
  if (resizeMode === "exact" && (width || height)) return { w: r(width ?? srcW), h: r(height ?? srcH) };
  return { w: r(srcW), h: r(srcH) };
}
