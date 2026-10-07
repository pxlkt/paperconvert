// ─── Pages ──────────────────────────────────────────────────────────────────
// Every URL PaperConvert answers on, and the words on it. A page exists for
// each conversion in the table under every name people search for the two
// formats by (/jpeg-to-png and /jpg-to-png), plus a hub per format and
// compress/resize pages for images. All of them are the same app with the
// target picked; the build prerenders each one (scripts/prerender.ts).

import { CONVERSIONS, findConversion, type Engine } from "./conversions";
import { FORMATS, getFormat, type FormatCategory, type FormatInfo } from "./formats";
import { LIMITS, canCopyStreams } from "./options";
import { formatBytes } from "./bytes";

export const SITE_ORIGIN = "https://convert.paperboard.dev";
export const SITE_NAME = "PaperConvert";

export type Route =
  | { kind: "home"; path: "/" }
  | { kind: "pair"; path: string; from: string; to: string; fromName: string; toName: string }
  | { kind: "format"; path: string; format: string; name: string }
  | { kind: "compress"; path: string; format: string; name: string }
  | { kind: "resize"; path: string; format: string; name: string };

// "md" and "markdown" are both searched; each page names the one in its URL
const NAME_LABELS: Record<string, string> = { md: "MD", markdown: "Markdown", excel: "Excel" };

/** Every name a format is searched by: its id first, then its aliases. */
export function namesOf(f: FormatInfo): string[] {
  return [f.id, ...(f.aliases ?? [])];
}

/** How a name is written in prose: "JPG", "JPEG", "Markdown". */
export function labelOf(name: string): string {
  return NAME_LABELS[name] ?? FORMATS.find((f) => f.id === name)?.label ?? name.toUpperCase();
}

const COMPRESSIBLE = ["jpg", "webp"];
const RESIZABLE = ["png", "jpg", "webp", "gif", "bmp", "tiff"];

function buildRoutes(): Route[] {
  const routes: Route[] = [{ kind: "home", path: "/" }];
  for (const c of CONVERSIONS) {
    if (c.from === c.to) continue;
    for (const fromName of namesOf(getFormat(c.from))) {
      for (const toName of namesOf(getFormat(c.to))) {
        routes.push({ kind: "pair", path: `/${fromName}-to-${toName}`, from: c.from, to: c.to, fromName, toName });
      }
    }
  }
  for (const f of FORMATS) {
    for (const name of namesOf(f)) {
      routes.push({ kind: "format", path: `/${name}-converter`, format: f.id, name });
      if (COMPRESSIBLE.includes(f.id)) routes.push({ kind: "compress", path: `/compress-${name}`, format: f.id, name });
      if (RESIZABLE.includes(f.id)) routes.push({ kind: "resize", path: `/resize-${name}`, format: f.id, name });
    }
  }
  return routes;
}

export const ROUTES: readonly Route[] = buildRoutes();
const BY_PATH = new Map(ROUTES.map((r) => [r.path, r]));

/** The route for a pathname; trailing slashes, /index.html and case are tolerated. */
export function resolvePath(pathname: string): Route | null {
  let p = pathname.toLowerCase().replace(/\/index\.html$/, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return BY_PATH.get(p || "/") ?? null;
}

/** What a page wants the queue to do: which source it expects and which target it picks. */
export function routeIntent(route: Route): { from?: string; to?: string; compress?: boolean; resize?: boolean } {
  switch (route.kind) {
    case "pair": return { from: route.from, to: route.to };
    case "format": return { from: route.format };
    case "compress": return { from: route.format, to: route.format, compress: true };
    case "resize": return { from: route.format, to: route.format, resize: true };
    default: return {};
  }
}

// ── Copy ─────────────────────────────────────────────────────────────────────

export interface Link {
  label: string;
  href: string;
}

export interface LinkGroup {
  heading: string;
  links: Link[];
}

export interface PageCopy {
  /** <title> */
  title: string;
  /** meta description, at most 160 characters */
  description: string;
  h1: string;
  lead: string;
  sections: { heading: string; body: string[] }[];
  faq: { q: string; a: string }[];
  related: LinkGroup[];
}

const ENGINE_NOTE: Record<Engine, string> = {
  image: "Your browser decodes the image and redraws it at the size you pick, then encodes the new format, all in this tab.",
  media: "PaperConvert runs FFmpeg, the open-source media toolkit, compiled to WebAssembly inside this tab. It loads once (about 30 MB) and then converts on your processor.",
  pdf: "PaperConvert opens the PDF with pdf.js, Mozilla's PDF reader, and renders or reads each page inside this tab.",
  text: "PaperConvert rewrites the text in this tab. PDF output is drawn with pdf-lib.",
  sheet: "PaperConvert reads and writes the workbook with SheetJS, inside this tab.",
};

const LIMIT_FOR: Record<FormatCategory, number> = {
  image: LIMITS.maxImageBytes,
  document: LIMITS.maxDocumentBytes,
  data: LIMITS.maxSheetBytes,
  audio: LIMITS.maxMediaBytes,
  video: LIMITS.maxMediaBytes,
};

function limitFor(from: string, engine: Engine): number {
  return engine === "media" ? LIMITS.maxMediaBytes : LIMIT_FOR[getFormat(from).category];
}

/** Facts specific to one pair that a person converting it should know first. */
export function pairNotes(from: string, to: string): string[] {
  const f = getFormat(from);
  const t = getFormat(to);
  const notes: string[] = [];
  if (from === "pdf" && to !== "txt") notes.push(`Every page becomes its own ${t.label} image. A one-page PDF gives one image; longer PDFs download as a ZIP of pages.`);
  if (from === "pdf" && to === "txt") notes.push("PaperConvert copies the PDF's text layer. A scanned PDF with no text layer has nothing to copy; convert it to an image instead.");
  if (to === "gif" && (f.category === "video" || from === "gif")) notes.push("The shareable preset keeps GIFs small enough to post: at most 480 px wide, 15 frames per second, 128 colours. Turn it off to pick your own size, frame rate and colours.");
  if (to === "gif" && f.category === "image" && from !== "gif") notes.push("GIF holds 256 colours, so photos may show banding. One-bit transparency is kept.");
  if (f.category === "video" && ["png", "jpg", "webp"].includes(to)) notes.push(`PaperConvert picks a representative frame from the start of the video and saves it as ${t.label}.`);
  if (f.category === "video" && t.category === "audio") notes.push(`The video's soundtrack is kept and saved as ${t.label}; the picture is dropped.`);
  if (from === "gif" && t.category === "video") notes.push(`Every frame of an animated GIF is kept. ${t.label} files are often a fraction of the GIF's size.`);
  if (from === "gif" && to === "webp") notes.push("Animated GIFs stay animated as WebP.");
  if (f.category === "image" && to === "ico") notes.push("The icon holds 16, 32, 48, 64, 128 and 256 px sizes (never larger than your image), with non-square images centred.");
  if ((to === "jpg" || to === "bmp") && f.category === "image") notes.push(`${t.label} has no transparency, so transparent areas are filled with a background colour you choose (white by default).`);
  if (to === "pdf" && f.category === "image") notes.push("The PDF page takes the image's shape, scaled to fit an A4 sheet.");
  if (to === "pdf" && f.category === "document") notes.push("PDFs are written with the standard Helvetica and Courier fonts, which cover Western European text. Other characters (emoji, CJK, Cyrillic) are replaced with “?”, and PaperConvert tells you how many.");
  if (["csv", "tsv", "json"].includes(to) && ["xlsx", "xls", "ods"].includes(from)) notes.push(`${t.label} holds a single table, so a workbook's first sheet is converted. PaperConvert tells you when other sheets were left out.`);
  if (from === "json") notes.push("The JSON must be an array of objects; each object becomes a row and each key a column.");
  if (canCopyStreams(from, to)) {
    notes.push("When the streams already fit the new container, PaperConvert copies them instead of re-encoding: no quality loss, and done in seconds.");
  }
  if (from === "heic") notes.push("HEIC photos from iPhones decode right here; nothing goes to Apple or anyone else.");
  if (from === "svg") notes.push("SVG is vector art, so you can export it at any pixel size without blur.");
  return notes;
}

function pairCopy(route: Extract<Route, { kind: "pair" }>): PageCopy {
  const A = labelOf(route.fromName);
  const B = labelOf(route.toName);
  const f = getFormat(route.from);
  const t = getFormat(route.to);
  const engine = findConversion(route.from, route.to)!.engine;
  const limit = formatBytes(limitFor(route.from, engine));
  const notes = pairNotes(route.from, route.to);
  return {
    title: `${A} to ${B} Converter: free, private, no upload | ${SITE_NAME}`,
    description: clip(`Convert ${A} to ${B} in your browser. Your files never leave your device: no upload, no sign-up, no queue. Free, up to ${limit} per file.`),
    h1: `${A} to ${B} converter`,
    lead: `Drop ${A} files below to turn them into ${B}. They are converted on this device and never uploaded.`,
    sections: [
      ...(notes.length ? [{ heading: `Before you convert ${A} to ${B}`, body: notes }] : []),
      {
        heading: `How to convert ${A} to ${B}`,
        body: [
          `1. Drop your ${A} files on the box above, paste them, or click Select files.`,
          `2. Check the target says ${B}. The gear button has quality and size settings.`,
          `3. Click Convert, then Save. Convert all handles a whole batch.`,
        ],
      },
      { heading: `${f.label} and ${t.label}`, body: [f.about, t.about] },
      { heading: "How it works", body: [ENGINE_NOTE[engine]] },
    ],
    faq: faqFor(A, B, limit, engine),
    related: [
      {
        heading: `Convert ${A} to other formats`,
        links: CONVERSIONS.filter((c) => c.from === route.from && c.to !== route.from && c.to !== route.to).map((c) => pairLink(route.fromName, c.to)),
      },
      {
        heading: `Convert other formats to ${B}`,
        links: CONVERSIONS.filter((c) => c.to === route.to && c.from !== route.to && c.from !== route.from).map((c) => pairLink(c.from, route.toName)),
      },
    ].filter((g) => g.links.length > 0),
  };
}

function pairLink(fromName: string, toName: string): Link {
  return { label: `${labelOf(fromName)} to ${labelOf(toName)}`, href: `/${fromName}-to-${toName}` };
}

function faqFor(A: string, B: string, limit: string, engine: Engine): PageCopy["faq"] {
  return [
    {
      q: `Is it safe to convert ${A} to ${B} here?`,
      a: "Yes. The conversion runs in this browser tab. Your files are never sent to a server, so there is nothing to intercept, store or leak.",
    },
    {
      q: "Is it free? Is there a daily limit?",
      a: `It is free, with no account and no daily limit. Each file can be up to ${limit}.`,
    },
    {
      q: "Does it work offline?",
      a: engine === "media"
        ? "Once this page and the media engine (about 30 MB, loaded on first use) are loaded, conversions need no connection."
        : "Once this page has loaded, conversions need no connection.",
    },
    {
      q: "How long does it take?",
      a: engine === "media"
        ? "There is no upload or download wait. Audio and short clips finish in seconds; long videos take as long as your processor needs to re-encode them."
        : "There is no upload or download wait, so most files are done in well under a second.",
    },
  ];
}

function clip(s: string): string {
  return s.length <= 160 ? s : `${s.slice(0, 157).replace(/\s+\S*$/, "")}...`;
}

function formatCopy(route: Extract<Route, { kind: "format" }>): PageCopy {
  const A = labelOf(route.name);
  const f = getFormat(route.format);
  const from = CONVERSIONS.filter((c) => c.from === f.id && c.to !== f.id);
  const to = CONVERSIONS.filter((c) => c.to === f.id && c.from !== f.id);
  return {
    title: `${A} Converter: convert ${A} files free, no upload | ${SITE_NAME}`,
    description: clip(`Convert ${A} files to ${from.slice(0, 4).map((c) => getFormat(c.to).label).join(", ")} and more, in your browser. Nothing is uploaded. Free, no sign-up.`),
    h1: `${A} converter`,
    lead: `Drop ${A} files below, pick a format, and convert them on this device. Nothing is uploaded.`,
    sections: [{ heading: `About ${A}`, body: [f.about] }],
    faq: faqFor(A, "another format", formatBytes(LIMIT_FOR[f.category]), from[0]?.engine ?? "image"),
    related: [
      { heading: `Convert ${A} to`, links: from.map((c) => pairLink(route.name, c.to)) },
      { heading: `Convert to ${A}`, links: to.map((c) => pairLink(c.from, route.name)) },
    ].filter((g) => g.links.length > 0),
  };
}

function imageToolCopy(route: Extract<Route, { kind: "compress" | "resize" }>): PageCopy {
  const A = labelOf(route.name);
  const compress = route.kind === "compress";
  const verb = compress ? "Compress" : "Resize";
  return {
    title: `${verb} ${A} images online: free, no upload | ${SITE_NAME}`,
    description: clip(compress
      ? `Make ${A} images smaller in your browser. Pick a quality and see the saving. Nothing is uploaded. Free, no sign-up.`
      : `Resize ${A} images by width, height or percentage in your browser. Nothing is uploaded. Free, no sign-up.`),
    h1: `${verb} ${A}`,
    lead: compress
      ? `Drop ${A} images below. PaperConvert re-encodes them at the quality you pick (75 to start) and shows how much smaller each one got.`
      : `Drop ${A} images below. PaperConvert starts at half size; the gear button sets an exact width, height or percentage.`,
    sections: [
      { heading: `About ${A}`, body: [getFormat(route.format).about] },
      { heading: "How it works", body: [ENGINE_NOTE.image] },
    ],
    faq: faqFor(A, A, formatBytes(LIMITS.maxImageBytes), "image"),
    related: [{ heading: `Convert ${A}`, links: CONVERSIONS.filter((c) => c.from === route.format && c.to !== route.format).map((c) => pairLink(route.name, c.to)) }],
  };
}

const CATEGORY_TITLES: Record<FormatCategory, string> = {
  image: "Images",
  document: "Documents",
  data: "Spreadsheets and data",
  audio: "Audio",
  video: "Video",
};

/** The full directory: every canonical pair, grouped by the source's category. */
export function directory(): LinkGroup[] {
  return (Object.keys(CATEGORY_TITLES) as FormatCategory[]).map((cat) => ({
    heading: CATEGORY_TITLES[cat],
    links: CONVERSIONS.filter((c) => c.from !== c.to && getFormat(c.from).category === cat).map((c) => pairLink(c.from, c.to)),
  }));
}

export const POPULAR: Link[] = [
  ["heic", "jpg"], ["png", "jpg"], ["jpg", "png"], ["webp", "png"], ["webp", "jpg"], ["mp4", "gif"], ["mov", "mp4"],
  ["pdf", "jpg"], ["mp4", "mp3"], ["png", "ico"], ["svg", "png"], ["xlsx", "csv"], ["csv", "json"], ["md", "pdf"],
  ["wav", "mp3"], ["gif", "mp4"],
].map(([a, b]) => pairLink(a!, b!));

function homeCopy(): PageCopy {
  return {
    title: `${SITE_NAME}: convert files in your browser, no upload`,
    description: "Convert images, video, audio, PDFs, documents and spreadsheets in your browser. Your files never leave your device: no upload, no sign-up, no limits.",
    h1: "Convert files without uploading them",
    lead: "Images, video, audio, PDFs, documents and spreadsheets, converted by your own computer. Nothing leaves this tab.",
    sections: [
      { heading: "How it works", body: [
        "Online converters upload your file to a server, convert it there and make you download it again. PaperConvert skips both trips: the converters run inside this page.",
        "Images use your browser's own decoders, audio and video use FFmpeg compiled to WebAssembly, PDFs use pdf.js and spreadsheets use SheetJS.",
      ] },
    ],
    faq: faqFor("files", "another format", formatBytes(LIMITS.maxMediaBytes), "media"),
    related: [{ heading: "Popular conversions", links: POPULAR }],
  };
}

export function pageCopy(route: Route): PageCopy {
  switch (route.kind) {
    case "home": return homeCopy();
    case "pair": return pairCopy(route);
    case "format": return formatCopy(route);
    case "compress":
    case "resize": return imageToolCopy(route);
  }
}
