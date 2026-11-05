// Links shared by the top bar, the footer and the prerendered pages. The
// Paperboard ones point at paperboard.dev, where PaperConvert's footer
// mirrors the main site's columns.

import type { Link } from "./routes";

export const PAPERBOARD_ORIGIN = "https://paperboard.dev";

export const PAPERBOARD_LINKS: Link[] = [
  { label: "About Paperboard", href: `${PAPERBOARD_ORIGIN}/` },
  { label: "Download", href: `${PAPERBOARD_ORIGIN}/downloads` },
  { label: "Blog", href: `${PAPERBOARD_ORIGIN}/blog` },
  { label: "PaperUI", href: `${PAPERBOARD_ORIGIN}/docs/paperui/` },
];

export const IMAGE_TOOLS: Link[] = [
  { label: "Compress JPG", href: "/compress-jpg" },
  { label: "Compress WebP", href: "/compress-webp" },
  { label: "Resize PNG", href: "/resize-png" },
  { label: "Resize JPG", href: "/resize-jpg" },
  { label: "Resize WebP", href: "/resize-webp" },
];

export const SOCIAL = {
  x: "https://x.com/PaperboardHQ",
  github: "https://github.com/MileniumHQ/Paperboard",
  discord: "https://discord.gg/DdnpP3pPfT",
  milenium: "https://mileniumhq.com",
};
