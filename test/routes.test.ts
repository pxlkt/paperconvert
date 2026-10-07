import { describe, expect, test } from "bun:test";
import { CONVERSIONS, findConversion } from "../src/lib/conversions";
import { ROUTES, pageCopy, resolvePath, routeIntent, directory } from "../src/lib/routes";

describe("routes", () => {
  test("paths are unique and resolve to themselves", () => {
    const paths = ROUTES.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const r of ROUTES) expect(resolvePath(r.path)).toBe(r);
  });

  test("every pair page is a conversion the engine runs", () => {
    for (const r of ROUTES) {
      if (r.kind !== "pair") continue;
      expect(findConversion(r.from, r.to)).toBeDefined();
    }
  });

  test("every cross-format conversion has a page, aliases included", () => {
    for (const c of CONVERSIONS.filter((c) => c.from !== c.to)) expect(resolvePath(`/${c.from}-to-${c.to}`)).not.toBeNull();
    expect(resolvePath("/jpeg-to-png")).toMatchObject({ kind: "pair", from: "jpg", to: "png", fromName: "jpeg" });
    expect(resolvePath("/excel-to-csv")).toMatchObject({ from: "xlsx", to: "csv" });
    expect(resolvePath("/markdown-to-pdf")).toMatchObject({ from: "md", to: "pdf" });
    // never a page for something that does not convert
    expect(resolvePath("/png-to-avif")).toBeNull();
    expect(resolvePath("/jpg-to-jpeg")).toBeNull();
    expect(resolvePath("/mp3-to-png")).toBeNull();
  });

  test("lookup tolerates case, trailing slash and index.html", () => {
    expect(resolvePath("/PNG-to-JPG/")?.path).toBe("/png-to-jpg");
    expect(resolvePath("/png-to-jpg/index.html")?.path).toBe("/png-to-jpg");
    expect(resolvePath("/index.html")?.kind).toBe("home");
    expect(resolvePath("/nope")).toBeNull();
  });

  test("titles are unique and descriptions fit a search snippet", () => {
    const titles = new Set<string>();
    for (const r of ROUTES) {
      const copy = pageCopy(r);
      expect(titles.has(copy.title)).toBe(false);
      titles.add(copy.title);
      expect(copy.description.length).toBeLessThanOrEqual(160);
      expect(copy.h1.length).toBeGreaterThan(0);
    }
  });

  test("related links only point at real pages", () => {
    for (const r of ROUTES.filter((_, i) => i % 7 === 0)) {
      for (const g of pageCopy(r).related) for (const l of g.links) expect(resolvePath(l.href)).not.toBeNull();
    }
    for (const g of directory()) for (const l of g.links) expect(resolvePath(l.href)).not.toBeNull();
  });

  test("compress and resize pages pick the same format with the tool preset", () => {
    expect(routeIntent(resolvePath("/compress-jpeg")!)).toEqual({ from: "jpg", to: "jpg", compress: true });
    expect(routeIntent(resolvePath("/resize-png")!)).toEqual({ from: "png", to: "png", resize: true });
  });
});
