import { describe, expect, test } from "bun:test";
import { CONVERSIONS, defaultTarget, findConversion, targetsFor } from "../src/lib/conversions";
import { FORMATS, detectFormat, formatById } from "../src/lib/formats";
import { DEFAULT_OPTIONS, computeOutputSize, optionGroups, sanitizeOptions } from "../src/lib/options";

describe("conversion table", () => {
  test("every pair names known formats and appears once", () => {
    const seen = new Set<string>();
    for (const c of CONVERSIONS) {
      expect(formatById(c.from)).toBeDefined();
      expect(formatById(c.to)).toBeDefined();
      const key = `${c.from}>${c.to}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  test("every format can be read, and its default target is a real pair", () => {
    for (const f of FORMATS) {
      expect(targetsFor(f.id).length).toBeGreaterThan(0);
      expect(findConversion(f.id, defaultTarget(f.id))).toBeDefined();
    }
  });

  test("a page's target wins only when the file can reach it", () => {
    expect(defaultTarget("png", "webp")).toBe("webp");
    expect(defaultTarget("mp3", "png")).toBe("wav");
  });

  test("outputs no engine writes are never offered", () => {
    // AVIF and HEIC have no encoder here; SVG output would be a fake vector
    for (const to of ["avif", "heic", "svg", "flv", "wmv", "3gp", "mpeg"]) {
      expect(CONVERSIONS.some((c) => c.to === to)).toBe(false);
    }
  });

  test("animated GIF to video, WebP and GIF keeps its frames through FFmpeg", () => {
    for (const to of ["mp4", "webm", "webp", "gif"]) expect(findConversion("gif", to)?.engine).toBe("media");
    expect(findConversion("gif", "png")?.engine).toBe("image");
  });
});

describe("format detection", () => {
  test("extension first, then mime, aliases included", () => {
    expect(detectFormat({ name: "IMG_0001.HEIC", type: "" })?.id).toBe("heic");
    expect(detectFormat({ name: "photo.jpeg", type: "" })?.id).toBe("jpg");
    expect(detectFormat({ name: "clip", type: "video/quicktime" })?.id).toBe("mov");
    expect(detectFormat({ name: "song", type: "audio/x-wav" })?.id).toBe("wav");
    expect(detectFormat({ name: "notes.unknown", type: "" })).toBeUndefined();
  });
});

describe("options", () => {
  test("every numeric option is clamped at the engine boundary", () => {
    const o = sanitizeOptions({ ...DEFAULT_OPTIONS, quality: 900, width: -4, percent: 9999, gifColors: 1, pdfDpi: 1e6, background: "red;}" });
    expect(o.quality).toBe(100);
    expect(o.width).toBeUndefined();
    expect(o.percent).toBe(400);
    expect(o.gifColors).toBe(2);
    expect(o.pdfDpi).toBe(600);
    expect(o.background).toBe("#ffffff");
  });

  test("resize keeps the aspect ratio unless exact", () => {
    const base = { ...DEFAULT_OPTIONS };
    expect(computeOutputSize(4000, 3000, { ...base, resizeMode: "width", width: 800 })).toEqual({ w: 800, h: 600 });
    expect(computeOutputSize(4000, 3000, { ...base, resizeMode: "percent", percent: 50 })).toEqual({ w: 2000, h: 1500 });
    expect(computeOutputSize(4000, 3000, { ...base, resizeMode: "exact", width: 10, height: 10 })).toEqual({ w: 10, h: 10 });
    expect(computeOutputSize(4000, 3000, base)).toEqual({ w: 4000, h: 3000 });
  });

  test("only settings the engine honours are shown", () => {
    expect(optionGroups("png", "png", DEFAULT_OPTIONS)).toEqual(["resize"]);
    expect(optionGroups("png", "jpg", DEFAULT_OPTIONS)).toEqual(["quality", "resize", "background"]);
    expect(optionGroups("csv", "json", DEFAULT_OPTIONS)).toEqual([]);
    expect(optionGroups("wav", "flac", DEFAULT_OPTIONS)).toEqual([]);
    expect(optionGroups("wav", "mp3", DEFAULT_OPTIONS)).toEqual(["quality"]);
    // a stream copy cannot change quality, size or frame rate
    expect(optionGroups("mov", "mp4", DEFAULT_OPTIONS)).toEqual(["copy", "mute"]);
    expect(optionGroups("mov", "mp4", { ...DEFAULT_OPTIONS, copyStreams: false })).toEqual(["copy", "quality", "resize", "fps", "mute"]);
    expect(optionGroups("webm", "mp4", DEFAULT_OPTIONS)).toEqual(["quality", "resize", "fps", "mute"]);
    expect(optionGroups("mp4", "gif", DEFAULT_OPTIONS)).toEqual(["gif"]);
    expect(optionGroups("mp4", "gif", { ...DEFAULT_OPTIONS, shareableGif: false })).toEqual(["gif", "resize"]);
    expect(optionGroups("pdf", "png", DEFAULT_OPTIONS)).toEqual(["pdf"]);
    expect(optionGroups("pdf", "txt", DEFAULT_OPTIONS)).toEqual([]);
  });
});
