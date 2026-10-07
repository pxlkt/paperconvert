import { describe, expect, test } from "bun:test";
import { encodeBmp, encodeIco, hasAlpha, icoSizesFor } from "../src/lib/encoders";

describe("BMP writer", () => {
  test("writes a valid 24-bit bottom-up bitmap with padded rows", () => {
    // 3x2: top row red, green, blue; bottom row white, black, grey
    const rgba = new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
      255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255,
    ]);
    const bmp = encodeBmp(rgba, 3, 2);
    const v = new DataView(bmp.buffer);
    expect(String.fromCharCode(bmp[0]!, bmp[1]!)).toBe("BM");
    const rowSize = 12; // 3 px * 3 bytes = 9, padded to 12
    expect(bmp.length).toBe(54 + rowSize * 2);
    expect(v.getUint32(2, true)).toBe(bmp.length);
    expect(v.getInt32(18, true)).toBe(3);
    expect(v.getInt32(22, true)).toBe(2);
    expect(v.getUint16(28, true)).toBe(24);
    // first stored row is the bottom row, in BGR order
    expect([...bmp.slice(54, 63)]).toEqual([255, 255, 255, 0, 0, 0, 128, 128, 128]);
    expect([...bmp.slice(54 + rowSize, 54 + rowSize + 9)]).toEqual([0, 0, 255, 0, 255, 0, 255, 0, 0]);
  });
});

describe("ICO writer", () => {
  test("directory entries point at each PNG, 256 written as 0", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5]);
    const ico = encodeIco([{ size: 16, png: a }, { size: 256, png: b }]);
    const v = new DataView(ico.buffer);
    expect(v.getUint16(2, true)).toBe(1);
    expect(v.getUint16(4, true)).toBe(2);
    expect(ico[6]).toBe(16);
    expect(ico[6 + 16]).toBe(0);
    const offA = v.getUint32(6 + 12, true);
    const offB = v.getUint32(6 + 16 + 12, true);
    expect(offA).toBe(6 + 32);
    expect([...ico.slice(offA, offA + 3)]).toEqual([1, 2, 3]);
    expect([...ico.slice(offB, offB + 2)]).toEqual([4, 5]);
    expect(() => encodeIco([])).toThrow();
  });

  test("sizes never upscale past the source", () => {
    expect(icoSizesFor(1024, 512)).toEqual([16, 32, 48, 64, 128, 256]);
    expect(icoSizesFor(50, 40)).toEqual([16, 32, 48]);
    expect(icoSizesFor(8, 8)).toEqual([16]);
  });

  test("alpha detection", () => {
    expect(hasAlpha(new Uint8Array([0, 0, 0, 255]))).toBe(false);
    expect(hasAlpha(new Uint8Array([0, 0, 0, 255, 0, 0, 0, 10]))).toBe(true);
  });
});
