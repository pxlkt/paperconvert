# PaperConvert

This is an SEO maxxed locally ran file converter. It runs fast sometimes, in the browser. There are better options but this works well. Here's yap from my agent:

## Run it

```sh
bun install
bun run dev        # http://localhost:5174
bun test           # engine, route and queue tests
```

PaperUI is linked from a Paperboard checkout next to this one (`../../Paperboard/packages/paperui`), because PaperConvert uses PaperUI 0.3.0. Switch the dependency to `^0.3.0` once that version is on npm.

## Build

```sh
bun run build
```

The build runs three steps:

1. `vite build` builds the app into `dist/`.
2. `vite build -c vite.prerender.config.ts` builds the same app as a render function.
3. `bun scripts/prerender.ts` renders every page in jsdom and writes it to `dist/`: one HTML file per page (`dist/png-to-jpg.html` is served at `/png-to-jpg`), `404.html` and `sitemap.xml`.

Each page ships its real markup, title, description, canonical URL, Open Graph tags and structured data, so search engines read it without running JavaScript. The app then replaces the markup with the same page, now interactive.

`dist/` is plain static files. The host has to serve `/png-to-jpg` from `png-to-jpg.html` and unknown paths from `404.html` (Cloudflare, Netlify and Vercel do this by default or with clean URLs on). `public/_headers` sets long caching on `/assets/*` for Cloudflare.

## Pages

`src/lib/routes.ts` lists every page: one per conversion under each name the formats are searched by (`/jpg-to-png`, `/jpeg-to-png`), a page per format (`/png-converter`), and compress and resize pages for images. Copy for every page is generated there.

## Engines

Each engine loads the first time a file needs it:

| Engine | Library | Formats |
| --- | --- | --- |
| Image | The browser's decoders, `heic-decode`, `utif`, `gifenc` | PNG, JPG, WebP, AVIF, GIF, BMP, ICO, TIFF, SVG, HEIC |
| Media | FFmpeg compiled to WebAssembly (about 30 MB, loaded once) | MP4, WebM, MOV, MKV, AVI, MP3, WAV, OGG, FLAC and others |
| PDF | pdf.js | PDF to images and text |
| Text | pdf-lib | Markdown, HTML, TXT, and those to PDF |
| Sheet | SheetJS | XLSX, XLS, ODS, CSV, TSV, JSON, HTML |

PaperConvert is open source under the MIT license.
