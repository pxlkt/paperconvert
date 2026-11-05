// Writes one static HTML file per page into dist/, plus 404.html and
// sitemap.xml. Run after both builds (`bun run build` does all three):
//   vite build                                -> dist/ (the app)
//   vite build -c vite.prerender.config.ts    -> dist-prerender/ (the app as a render function)
//   bun scripts/prerender.ts
// Each page is the real app rendered in jsdom, so the static markup is what
// the app draws: the first paint matches, and search engines read the page's
// headings, copy, FAQ and links without running JavaScript.

import { JSDOM } from "jsdom";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const built = await readFile(join(dist, "index.html"), "utf8");
// Preload the fonts the first paint uses: the icon font (PaperProvider shows
// nothing until it is in) and the two text faces.
const fonts = (await readdir(join(dist, "assets"))).filter((f) => /^(MaterialSymbolsRounded|Nunito|NunitoSans)[.-].*\.woff2$/.test(f) && !f.includes("Italic"));
if (!fonts.some((f) => f.startsWith("MaterialSymbolsRounded"))) throw new Error("The icon font is missing from dist/assets");
const template = built.replace(
  "<!--head-->",
  `<!--head-->\n    ${fonts.map((f) => `<link rel="preload" href="/assets/${f}" as="font" type="font/woff2" crossorigin />`).join("\n    ")}`,
);
if (!template.includes("<!--head-->") || !template.includes("<!--app-->")) {
  throw new Error("dist/index.html is missing the <!--head--> or <!--app--> marker");
}

// the browser globals the app and PaperUI touch while rendering
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "https://convert.paperboard.dev/",
  pretendToBeVisual: true,
});
// every window property Node lacks (HTMLElement, MutationObserver, ...), as jsdom-global does
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  Object.defineProperty(globalThis, key, {
    configurable: true,
    get: () => (dom.window as unknown as Record<string, unknown>)[key],
  });
}
for (const key of ["window", "document", "navigator", "location", "history", "localStorage"] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
// jsdom has no layout: media queries never match and nothing resizes
const matchMedia = (query: string) => ({
  matches: false, media: query, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
});
class ResizeObserver { observe() {} unobserve() {} disconnect() {} }
Object.assign(dom.window, { matchMedia, ResizeObserver });
Object.assign(globalThis, { matchMedia, ResizeObserver });
dom.window.scrollTo = () => {};

type Bundle = typeof import("../src/prerender");
const app: Bundle = await import(join(root, "dist-prerender", "prerender.js"));

// The provider's theme is baked into the markup as dark. Stripping it lets the
// page follow the theme the inline script put on <html>, so a visitor who
// picked light never sees a dark first frame.
function clean(html: string): string {
  return html.replace(/ data-paperui-theme="(?:dark|light)"/g, "");
}

function page(head: string, body: string): string {
  return template.replace("<!--head-->", head).replace("<!--app-->", clean(body));
}

/** "/" -> index.html, "/png-to-jpg" -> png-to-jpg.html (served at /png-to-jpg). */
function fileFor(path: string): string {
  return path === "/" ? "index.html" : `${path.slice(1)}.html`;
}

let count = 0;
for (const route of app.ROUTES) {
  const copy = app.pageCopy(route);
  await writeFile(join(dist, fileFor(route.path)), page(app.headHtml(route, copy), app.renderPage(route.path)));
  count++;
}
await writeFile(join(dist, "404.html"), page(app.headHtml(null, app.NOT_FOUND_COPY), app.renderPage("/404")));

const sitemap = [
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
  ...app.ROUTES.map((r) => `  <url><loc>${app.SITE_ORIGIN}${r.path}</loc></url>`),
  `</urlset>`,
  ``,
].join("\n");
await writeFile(join(dist, "sitemap.xml"), sitemap);

await rm(join(root, "dist-prerender"), { recursive: true, force: true });
console.log(`prerendered ${count} pages, 404.html and sitemap.xml`);
dom.window.close();
