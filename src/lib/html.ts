// HTML escaping, shared by the text engine and the page head. Kept apart from
// the engines so the page can escape text without loading pdf-lib.

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text for an HTML body or a quoted attribute. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}
