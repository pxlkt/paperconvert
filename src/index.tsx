import { render } from "solid-js/web";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("The #root element is missing");

// The build prerenders this page's markup into #root. The app replaces it
// with the same markup, now interactive. PaperProvider hides its content
// until the icon font has loaded, so swapping before then would blank a page
// that is already showing; the prerendered icons start that load.
const start = () => {
  root.textContent = "";
  render(() => <App path={location.pathname} />, root);
};
if (root.childElementCount > 0 && document.fonts) {
  void document.fonts.ready.then(start);
} else {
  start();
}
