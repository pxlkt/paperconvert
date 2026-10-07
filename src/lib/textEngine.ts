// ─── Text engine ────────────────────────────────────────────────────────────
// Markdown, HTML and plain text to each other, and any of them to PDF with
// pdf-lib's built-in fonts. Markdown is escaped before any markup is added,
// so source text can never contribute an element or attribute of its own.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { ConversionError } from "./errors";

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text for an HTML body or a quoted attribute. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}

// links and images may point at the web, mail, or a relative path; a
// javascript:/data: target would run when the converted file is opened
function safeUrl(escapedUrl: string): string {
  const url = escapedUrl.trim();
  return /^(https?:|mailto:)/i.test(url) || !/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : "#";
}

// Inline HTML that Markdown documents commonly carry. Bare tags only: no
// attributes, so nothing here can hold a handler or a URL.
const SAFE_INLINE_TAGS = "br|hr|kbd|b|i|u|s|em|strong|del|ins|mark|small|sub|sup|code";
const SAFE_TAG_PATTERN = new RegExp(`&lt;(/?)(${SAFE_INLINE_TAGS})\\s*(/?)&gt;`, "gi");

/** Inline Markdown on one already-escaped line or paragraph. */
function inline(escaped: string): string {
  // code spans first, and kept out of every later rule
  const codes: string[] = [];
  let s = escaped.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s
    .replace(SAFE_TAG_PATTERN, (_m, close: string, tag: string, selfClose: string) =>
      `<${close}${tag.toLowerCase()}${selfClose && !close ? " /" : ""}>`,
    )
    .replace(/!\[(.*?)\]\((.*?)\)/g, (_m, alt: string, src: string) => `<img alt="${alt}" src="${safeUrl(src)}" />`)
    .replace(/\[(.*?)\]\((.*?)\)/g, (_m, label: string, href: string) => `<a href="${safeUrl(href)}">${label}</a>`)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>");
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)]!);
}

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "code"; lines: string[] }
  | { kind: "rule" };

/** Splits Markdown into blocks. Shared by the HTML and PDF writers. */
export function parseMarkdownBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (/^\s*```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i]!)) code.push(lines[i++]!);
      i++; // closing fence (or end of file)
      blocks.push({ kind: "code", lines: code });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1]!.length, text: heading[2]! });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }
    const listItem = /^\s*([-*+]|\d+[.)])\s+(.*)$/;
    const first = listItem.exec(line);
    if (first) {
      const ordered = /\d/.test(first[1]!);
      const items: string[] = [];
      let m: RegExpExecArray | null;
      while (i < lines.length && (m = listItem.exec(lines[i]!)) && /\d/.test(m[1]!) === ordered) {
        items.push(m[2]!);
        i++;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) quote.push(lines[i++]!.replace(/^\s*>\s?/, ""));
      blocks.push({ kind: "quote", lines: quote });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,6}\s|\s*```|\s*>|\s*([-*+]|\d+[.)])\s)/.test(lines[i]!)) {
      para.push(lines[i++]!);
    }
    if (para.length === 0) para.push(lines[i++]!);
    blocks.push({ kind: "paragraph", lines: para });
  }
  return blocks;
}

export function htmlDocument(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;line-height:1.6;max-width:46rem;margin:2.5rem auto;padding:0 1.25rem;color:#222}pre{background:#f4f4f4;padding:.75rem;overflow:auto}code{font-family:ui-monospace,monospace}blockquote{border-left:3px solid #ccc;margin-left:0;padding-left:1rem;color:#555}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.4rem .6rem;text-align:left}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

export function markdownToHtml(md: string, title = "Document"): string {
  const html = parseMarkdownBlocks(md)
    .map((b) => {
      switch (b.kind) {
        case "heading": return `<h${b.level}>${inline(escapeHtml(b.text))}</h${b.level}>`;
        case "paragraph": return `<p>${b.lines.map((l) => inline(escapeHtml(l.trim()))).join("<br />")}</p>`;
        case "list": {
          const tag = b.ordered ? "ol" : "ul";
          return `<${tag}>${b.items.map((it) => `<li>${inline(escapeHtml(it))}</li>`).join("")}</${tag}>`;
        }
        case "quote": return `<blockquote><p>${b.lines.map((l) => inline(escapeHtml(l))).join("<br />")}</p></blockquote>`;
        case "code": return `<pre><code>${escapeHtml(b.lines.join("\n"))}</code></pre>`;
        case "rule": return "<hr />";
      }
    })
    .join("\n");
  return htmlDocument(title, html);
}

export function textToHtml(text: string, title = "Document"): string {
  return htmlDocument(title, `<pre style="white-space:pre-wrap;background:none;padding:0">${escapeHtml(text)}</pre>`);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };

/** Decodes the common named and numeric entities, for plain-text output. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function htmlToMarkdown(html: string): string {
  return html
    // script and style are not content: drop them with their bodies, not
    // just their tags, so code never lands in the document as text
    .replace(/<(script|style|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, n: string, t: string) => `${"#".repeat(Number(n))} ${t.trim()}\n\n`)
    .replace(/<(strong|b)\b[^>]*>(.*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)\b[^>]*>(.*?)<\/\1>/gi, "*$2*")
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    .replace(/<\/(ul|ol)>/gi, "\n")
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    // an unterminated tag ("<script" with no ">") survives the strip above
    .replace(/<[a-z!/?][^>]*$/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain text of an HTML document: Markdown marks removed, entities decoded. */
export function htmlToText(html: string): string {
  return decodeEntities(markdownToText(htmlToMarkdown(html)));
}

/** Plain text of Markdown: emphasis and link syntax removed, link targets kept in brackets. */
export function markdownToText(md: string): string {
  return md
    .replace(/!\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, (_m, label: string, href: string) => (label === href ? label : `${label} (${href})`))
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/gm, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^(#{1,6})\s+/gm, "")
    .replace(/^\s*```.*$/gm, "");
}

// ── PDF ──────────────────────────────────────────────────────────────────────

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  mono: PDFFont;
}

export interface PdfTextResult {
  blob: Blob;
  /** characters the built-in PDF fonts cannot draw, replaced with "?" */
  replaced: number;
}

/** Replaces characters outside the font's set (WinAnsi), counting them. */
export function fitToCharset(text: string, supported: Set<number>, counter: { n: number }): string {
  let out = "";
  for (const ch of text.replace(/\t/g, "    ")) {
    const cp = ch.codePointAt(0)!;
    if (cp === 10 || supported.has(cp)) out += ch;
    else {
      counter.n++;
      out += "?";
    }
  }
  return out;
}

class PdfWriter {
  private page: PDFPage;
  private y: number;
  readonly margin = 56;
  readonly pageW = 595.28;
  readonly pageH = 841.89;

  constructor(private doc: PDFDocument, private supported: Set<number>, readonly counter: { n: number }) {
    this.page = doc.addPage([this.pageW, this.pageH]);
    this.y = this.pageH - this.margin;
  }

  private ensure(height: number) {
    if (this.y - height < this.margin) {
      this.page = this.doc.addPage([this.pageW, this.pageH]);
      this.y = this.pageH - this.margin;
    }
  }

  gap(h: number) {
    this.y -= h;
  }

  /** Writes wrapped text; a word wider than the line is broken by character. */
  text(raw: string, font: PDFFont, size: number, indent = 0, color = rgb(0.1, 0.1, 0.1)) {
    const text = fitToCharset(raw, this.supported, this.counter);
    const maxW = this.pageW - this.margin * 2 - indent;
    const lineH = size * 1.45;
    for (const para of text.split("\n")) {
      const words = para.split(/(\s+)/);
      let line = "";
      const flush = () => {
        this.ensure(lineH);
        this.page.drawText(line.trimEnd(), { x: this.margin + indent, y: this.y - size, size, font, color });
        this.y -= lineH;
        line = "";
      };
      for (const word of words) {
        if (font.widthOfTextAtSize(line + word, size) <= maxW) {
          line += word;
          continue;
        }
        if (line.trim()) flush();
        if (/^\s+$/.test(word)) continue;
        let chunk = "";
        for (const ch of word) {
          if (font.widthOfTextAtSize(chunk + ch, size) > maxW && chunk) {
            line = chunk;
            flush();
            chunk = "";
          }
          chunk += ch;
        }
        line = chunk;
      }
      if (line.trim() || para === "") flush();
    }
  }
}

async function newPdf(): Promise<{ doc: PDFDocument; fonts: Fonts; supported: Set<number> }> {
  const doc = await PDFDocument.create();
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  // the four standard fonts share the WinAnsi character set
  return { doc, fonts, supported: new Set(fonts.regular.getCharacterSet()) };
}

async function finish(doc: PDFDocument, replaced: number): Promise<PdfTextResult> {
  const bytes = await doc.save();
  return { blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }), replaced };
}

export async function textToPdf(text: string): Promise<PdfTextResult> {
  const { doc, fonts, supported } = await newPdf();
  const w = new PdfWriter(doc, supported, { n: 0 });
  w.text(text.replace(/\r\n?/g, "\n"), fonts.regular, 11);
  return finish(doc, w.counter.n);
}

export async function markdownToPdf(md: string): Promise<PdfTextResult> {
  const { doc, fonts, supported } = await newPdf();
  const w = new PdfWriter(doc, supported, { n: 0 });
  const sizes = [0, 22, 18, 15, 13, 12, 11];
  for (const b of parseMarkdownBlocks(md)) {
    switch (b.kind) {
      case "heading":
        w.gap(6);
        w.text(markdownToText(b.text), fonts.bold, sizes[b.level]!);
        w.gap(4);
        break;
      case "paragraph":
        w.text(markdownToText(b.lines.map((l) => l.trim()).join(" ")), fonts.regular, 11);
        w.gap(8);
        break;
      case "list":
        b.items.forEach((item, n) => w.text(`${b.ordered ? `${n + 1}.` : "•"}  ${markdownToText(item)}`, fonts.regular, 11, 12));
        w.gap(8);
        break;
      case "quote":
        w.text(markdownToText(b.lines.join("\n")), fonts.italic, 11, 16, rgb(0.35, 0.35, 0.35));
        w.gap(8);
        break;
      case "code":
        w.text(b.lines.join("\n"), fonts.mono, 9.5, 8);
        w.gap(8);
        break;
      case "rule":
        w.gap(12);
        break;
    }
  }
  return finish(doc, w.counter.n);
}

export async function htmlToPdf(html: string): Promise<PdfTextResult> {
  return markdownToPdf(decodeEntities(htmlToMarkdown(html)));
}

export interface TextResult {
  blob: Blob;
  warnings: string[];
}

export async function convertText(file: File, from: string, to: string): Promise<TextResult> {
  const text = await file.text();
  const title = file.name.replace(/\.[^.]+$/, "");
  const warnings: string[] = [];
  const out = (s: string, mime: string): TextResult => ({ blob: new Blob([s], { type: `${mime};charset=utf-8` }), warnings });

  if (to === "pdf") {
    const res = from === "md" ? await markdownToPdf(text) : from === "html" ? await htmlToPdf(text) : await textToPdf(text);
    if (res.replaced > 0) {
      warnings.push(`${res.replaced} character${res.replaced === 1 ? "" : "s"} outside the PDF's Western European font (emoji, CJK, Cyrillic and similar) became “?”.`);
    }
    return { blob: res.blob, warnings };
  }
  if (to === "html") return out(from === "md" ? markdownToHtml(text, title) : textToHtml(text, title), "text/html");
  if (to === "md") return out(from === "html" ? htmlToMarkdown(text) : text, "text/markdown");
  if (to === "txt") return out(from === "html" ? htmlToText(text) : from === "md" ? markdownToText(text) : text, "text/plain");
  throw new ConversionError(`The text engine cannot write ${to}.`);
}
