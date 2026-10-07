// ─── Pure image container writers ───────────────────────────────────────────
// Browsers' canvas encoders cover PNG, JPEG and (mostly) WebP. These write the
// formats canvas silently refuses: asked for BMP, a canvas hands back PNG.

/** 24-bit BMP from RGBA pixels. Alpha is dropped; flatten before calling. */
export function encodeBmp(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8Array {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const out = new Uint8Array(54 + pixelBytes);
  const v = new DataView(out.buffer);
  out[0] = 0x42; // B
  out[1] = 0x4d; // M
  v.setUint32(2, out.length, true);
  v.setUint32(10, 54, true); // pixel data offset
  v.setUint32(14, 40, true); // BITMAPINFOHEADER
  v.setInt32(18, width, true);
  v.setInt32(22, height, true); // positive: rows stored bottom-up
  v.setUint16(26, 1, true); // planes
  v.setUint16(28, 24, true); // bits per pixel
  v.setUint32(34, pixelBytes, true);
  v.setInt32(38, 2835, true); // 72 dpi
  v.setInt32(42, 2835, true);
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 4;
    let dst = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const i = src + x * 4;
      out[dst++] = rgba[i + 2]!;
      out[dst++] = rgba[i + 1]!;
      out[dst++] = rgba[i]!;
    }
  }
  return out;
}

export interface IcoImage {
  size: number;
  png: Uint8Array;
}

/** ICO container of PNG-compressed images (Windows Vista and later, every browser). */
export function encodeIco(images: IcoImage[]): Uint8Array {
  if (images.length === 0) throw new Error("An icon needs at least one size.");
  const headerSize = 6 + 16 * images.length;
  const total = headerSize + images.reduce((n, i) => n + i.png.byteLength, 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint16(2, 1, true); // type: icon
  v.setUint16(4, images.length, true);
  let offset = headerSize;
  images.forEach((img, i) => {
    const e = 6 + i * 16;
    out[e] = img.size >= 256 ? 0 : img.size; // 0 means 256
    out[e + 1] = img.size >= 256 ? 0 : img.size;
    v.setUint16(e + 4, 1, true); // colour planes
    v.setUint16(e + 6, 32, true); // bits per pixel
    v.setUint32(e + 8, img.png.byteLength, true);
    v.setUint32(e + 12, offset, true);
    out.set(img.png, offset);
    offset += img.png.byteLength;
  });
  return out;
}

export const ICO_SIZES = [16, 32, 48, 64, 128, 256];

/** Icon sizes worth writing for a source: never upscaled past the source, always at least 16. */
export function icoSizesFor(srcW: number, srcH: number): number[] {
  const max = Math.max(srcW, srcH);
  const sizes = ICO_SIZES.filter((s) => s <= max);
  return sizes.length ? sizes : [16];
}

/** Whether any pixel is not fully opaque. */
export function hasAlpha(rgba: Uint8Array | Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) return true;
  return false;
}
