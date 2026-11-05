// Build-time entry: renders a page of the real app to markup, inside jsdom.
// scripts/prerender.ts loads the bundle built from this file and writes each
// page's markup into its HTML file, so the first paint and search engines get
// the page the app would draw.

import { render } from "solid-js/web";
import App from "./App";

export { ROUTES, pageCopy, SITE_ORIGIN } from "./lib/routes";
export { headHtml, NOT_FOUND_COPY } from "./head";

export function renderPage(path: string): string {
  const root = document.createElement("div");
  document.body.append(root);
  const dispose = render(() => <App path={path} />, root);
  const html = root.innerHTML;
  dispose();
  root.remove();
  return html;
}
