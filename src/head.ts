// Document head for a page: shared by the prerender script (as HTML text) and
// the app (applied to the live document on client-side navigation).

import { SITE_NAME, SITE_ORIGIN, type PageCopy, type Route } from "./lib/routes";
import { escapeHtml } from "./lib/textEngine";

export const NOT_FOUND_COPY: PageCopy = {
  title: `Page not found | ${SITE_NAME}`,
  description: "This page does not exist, but the converter does: drop any file to convert it in your browser.",
  h1: "That page doesn't exist",
  lead: "The converter still works: drop any file below and pick a format.",
  sections: [],
  faq: [],
  related: [],
};

export function canonicalUrl(route: Route): string {
  return `${SITE_ORIGIN}${route.path === "/" ? "/" : route.path}`;
}

/** Structured data: the app itself, plus the breadcrumb for a conversion page. */
export function structuredData(route: Route, copy: PageCopy): object[] {
  const app = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: route.kind === "home" ? SITE_NAME : copy.h1,
    url: canonicalUrl(route),
    description: copy.description,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any modern web browser",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@type": "Organization", name: "Paperboard", url: "https://paperboard.dev" },
  };
  if (route.kind === "home") return [app];
  return [
    app,
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${SITE_ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: copy.h1, item: canonicalUrl(route) },
      ],
    },
  ];
}

/** JSON for a <script> body: "<" is escaped so the text cannot close the element. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function headHtml(route: Route | null, copy: PageCopy): string {
  const lines = [
    `<title>${escapeHtml(copy.title)}</title>`,
    `<meta name="description" content="${escapeHtml(copy.description)}" />`,
  ];
  if (!route) {
    lines.push(`<meta name="robots" content="noindex" />`);
    return lines.join("\n    ");
  }
  const url = canonicalUrl(route);
  lines.push(
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${escapeHtml(copy.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(copy.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${SITE_ORIGIN}/logo.png" />`,
    `<meta name="twitter:card" content="summary" />`,
    ...structuredData(route, copy).map((d) => `<script type="application/ld+json">${scriptJson(d)}</script>`),
  );
  return lines.join("\n    ");
}

/** Brings the live document's head in line with a page after client-side navigation. */
export function applyHead(route: Route | null, copy: PageCopy): void {
  document.title = copy.title;
  const set = (selector: string, make: () => HTMLElement, attr: string, value: string | null) => {
    let el = document.head.querySelector<HTMLElement>(selector);
    if (value === null) {
      el?.remove();
      return;
    }
    if (!el) {
      el = make();
      document.head.append(el);
    }
    el.setAttribute(attr, value);
  };
  const meta = (key: "name" | "property", name: string) => () => {
    const m = document.createElement("meta");
    m.setAttribute(key, name);
    return m;
  };
  set('meta[name="description"]', meta("name", "description"), "content", copy.description);
  set('meta[property="og:title"]', meta("property", "og:title"), "content", route ? copy.title : null);
  set('meta[property="og:description"]', meta("property", "og:description"), "content", route ? copy.description : null);
  set('meta[property="og:url"]', meta("property", "og:url"), "content", route ? canonicalUrl(route) : null);
  set('meta[name="robots"]', meta("name", "robots"), "content", route ? null : "noindex");
  set('link[rel="canonical"]', () => Object.assign(document.createElement("link"), { rel: "canonical" }), "href", route ? canonicalUrl(route) : null);
  for (const s of document.head.querySelectorAll('script[type="application/ld+json"]')) s.remove();
  if (route) {
    for (const d of structuredData(route, copy)) {
      const s = document.createElement("script");
      s.type = "application/ld+json";
      s.textContent = scriptJson(d);
      document.head.append(s);
    }
  }
}
