// The page theme, shared with paperboard.dev's behaviour: dark unless the
// visitor picked light. The inline script in index.html applies the stored
// choice to <html> before the first paint; PaperProvider (with no theme prop)
// follows that attribute, so toggling only has to rewrite it.

import { createSignal } from "solid-js";

export const THEME_KEY = "paperconvert-theme";

export type Theme = "dark" | "light";

function readTheme(): Theme {
  return document.documentElement.getAttribute("data-paperui-theme") === "light" ? "light" : "dark";
}

export function createTheme() {
  const [theme, setTheme] = createSignal<Theme>(readTheme());
  const toggle = () => {
    const next: Theme = theme() === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-paperui-theme", next);
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // storage blocked (private mode): the choice lasts for this page only
    }
  };
  return { theme, toggle };
}
