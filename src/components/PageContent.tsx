import { PaperButton, PaperCard, PaperFlex, PaperIcon, PaperText, PaperTextList } from "@mileniumhq/paperui";
import { For, Show } from "solid-js";
import { CONVERSIONS } from "../lib/conversions";
import { FORMATS, type FormatCategory } from "../lib/formats";
import { labelOf, type PageCopy } from "../lib/routes";
import { PAPERBOARD_ORIGIN } from "../lib/site";

const CATEGORIES: { id: FormatCategory; title: string }[] = [
  { id: "image", title: "Images" },
  { id: "video", title: "Video" },
  { id: "audio", title: "Audio" },
  { id: "document", title: "Documents" },
  { id: "data", title: "Spreadsheets and data" },
];

/**
 * Every conversion, one closed row per category. Opened, a category lists
 * each source format's page, then each target's page. All links are in the
 * markup either way.
 */
function Directory() {
  return (
    <section id="conversions" class="conv-section">
      <PaperText as="h2" preset="subheader">
        All conversions
      </PaperText>
      <PaperCard class="conv-disclosure">
        <For each={CATEGORIES}>
          {(cat) => {
            const formats = FORMATS.filter((f) => f.category === cat.id);
            const count = CONVERSIONS.filter((c) => c.from !== c.to && formats.some((f) => f.id === c.from)).length;
            return (
              <details>
                <summary>
                  <PaperFlex direction="row" align="baseline" gap="half">
                    <PaperText as="h3" preset="text" weight={600}>
                      {cat.title}
                    </PaperText>
                    <PaperText preset="hint">{`${formats.map((f) => f.label).slice(0, 5).join(", ")}${formats.length > 5 ? ` and ${formats.length - 5} more` : ""}. ${count} conversions.`}</PaperText>
                  </PaperFlex>
                  <PaperIcon zeroHeight aria-hidden="true" class="conv-disclosure-chevron">
                    expand_more
                  </PaperIcon>
                </summary>
                <For each={formats}>
                  {(f) => {
                    const targets = CONVERSIONS.filter((c) => c.from === f.id && c.to !== f.id);
                    return (
                      <Show when={targets.length}>
                        <div class="conv-directory-row">
                          <a href={`/${f.id}-converter`} data-internal class="conv-directory-source">
                            {f.label}
                          </a>
                          <ul class="conv-directory-targets" aria-label={`Convert ${f.label} to`}>
                            <For each={targets}>
                              {(c) => (
                                <li>
                                  <a href={`/${f.id}-to-${c.to}`} data-internal title={`${f.label} to ${labelOf(c.to)}`}>
                                    {labelOf(c.to)}
                                  </a>
                                </li>
                              )}
                            </For>
                          </ul>
                        </div>
                      </Show>
                    );
                  }}
                </For>
              </details>
            );
          }}
        </For>
      </PaperCard>
    </section>
  );
}

/**
 * Everything under the converter. The page's copy is all in the markup for
 * search engines, but packed for people: prose in a row of cards, the FAQ as
 * closed rows, related pages in one card. The full directory is on the home
 * page only.
 */
export function PageContent(props: { copy: PageCopy; directory: boolean }) {
  return (
    <>
      <Show when={props.copy.sections.length}>
        <div class="conv-cards">
          <For each={props.copy.sections}>
            {(s) => (
              <PaperCard padding="double" gap="half">
                <PaperText as="h2" preset="label">
                  {s.heading}
                </PaperText>
                <For each={s.body}>
                  {(p) => (
                    <PaperText as="p" preset="body" color="text-subtle">
                      {p}
                    </PaperText>
                  )}
                </For>
                <Show when={s.steps}>
                  {(steps) => (
                    <PaperTextList ordered preset="body" color="text-subtle" spacing="compact">
                      <For each={steps()}>{(step) => <li>{step}</li>}</For>
                    </PaperTextList>
                  )}
                </Show>
              </PaperCard>
            )}
          </For>
        </div>
      </Show>

      <Show when={props.copy.faq.length}>
        <section class="conv-section">
          <PaperText as="h2" preset="subheader">
            Questions
          </PaperText>
          <PaperCard class="conv-disclosure conv-faq">
            <For each={props.copy.faq}>
              {(f) => (
                <details>
                  <summary>
                    <PaperText as="h3" preset="text" weight={600}>
                      {f.q}
                    </PaperText>
                    <PaperIcon zeroHeight aria-hidden="true" class="conv-disclosure-chevron">
                      expand_more
                    </PaperIcon>
                  </summary>
                  <PaperText as="p" preset="body" color="text-subtle">
                    {f.a}
                  </PaperText>
                </details>
              )}
            </For>
          </PaperCard>
        </section>
      </Show>

      <Show when={props.copy.related.length}>
        <PaperCard padding="double" gap="double">
          <For each={props.copy.related}>
            {(g) => (
              <PaperFlex gap="half" fullWidth>
                <PaperText as="h2" preset="heading">
                  {g.heading}
                </PaperText>
                <ul class="conv-links">
                  <For each={g.links}>
                    {(l) => (
                      <li>
                        <a href={l.href} data-internal>
                          {l.label}
                        </a>
                      </li>
                    )}
                  </For>
                </ul>
              </PaperFlex>
            )}
          </For>
        </PaperCard>
      </Show>

      <Show when={props.directory}>
        <Directory />
      </Show>

      <PaperCard padding="double" class="conv-pitch">
        <img src="/paperboard-64.png" alt="" width="48" height="48" />
        <PaperFlex gap="onefourth" minWidth={0}>
          <PaperText as="h2" preset="label">
            Your computer can run more than a converter.
          </PaperText>
          <PaperText as="p" preset="body" color="text-subtle">
            Paperboard is a desktop app for the programs you host yourself: a Minecraft server, a Discord bot, a local
            AI model, a terminal. Each one is a panel you install and run on your own machine.
          </PaperText>
        </PaperFlex>
        <PaperButton href={PAPERBOARD_ORIGIN} target="_blank" rel="noopener">
          See Paperboard <PaperIcon zeroHeight aria-hidden="true">north_east</PaperIcon>
        </PaperButton>
      </PaperCard>
    </>
  );
}
