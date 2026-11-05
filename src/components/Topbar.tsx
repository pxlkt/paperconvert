import { PaperButton, PaperFlex, PaperIcon, PaperSpacer, PaperText } from "@mileniumhq/paperui";
import { PAPERBOARD_ORIGIN } from "../lib/site";
import type { Theme } from "../lib/theme";

/** The same bar as paperboard.dev: brand on the left, quiet text links, theme on the right. */
export function Topbar(props: { theme: Theme; onToggleTheme: () => void }) {
  return (
    <header class="conv-topbar">
      <a href="/" data-internal class="conv-brand">
        <img src="/logo-64.png" alt="" width="30" height="30" />
        <PaperText rounded weight={800} size={5}>
          PaperConvert
        </PaperText>
      </a>
      <nav class="conv-topbar-links" aria-label="Main">
        <PaperButton variant="text" size="tiny" href="/#conversions" data-internal>
          All conversions
        </PaperButton>
        <PaperButton variant="text" size="tiny" href="/compress-jpg" data-internal>
          Compress
        </PaperButton>
        <PaperButton variant="text" size="tiny" href="/resize-png" data-internal>
          Resize
        </PaperButton>
      </nav>
      <PaperSpacer />
      <PaperFlex direction="row" align="center" gap="threefourths">
        <PaperButton variant="text" size="tiny" href={PAPERBOARD_ORIGIN} target="_blank" rel="noopener">
          Paperboard <PaperIcon zeroHeight aria-hidden="true">north_east</PaperIcon>
        </PaperButton>
        <PaperButton
          icon
          variant="text"
          size="tiny"
          aria-label={props.theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={props.onToggleTheme}
        >
          {props.theme === "dark" ? "dark_mode" : "light_mode"}
        </PaperButton>
      </PaperFlex>
    </header>
  );
}
