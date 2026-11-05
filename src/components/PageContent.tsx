import { PaperButton, PaperCard, PaperFlex, PaperIcon, PaperText, PaperTextList } from "@mileniumhq/paperui";
import { For, Show } from "solid-js";
import { CONVERSIONS } from "../lib/conversions";
import { FORMATS, type FormatCategory } from "../lib/formats";
import { labelOf, type LinkGroup, type PageCopy } from "../lib/routes";
import { PAPERBOARD_ORIGIN } from "../lib/site";

function LinkList(props: { group: LinkGroup }) {
  return (
    <section class="conv-section">
      <PaperText as="h2" preset="subheader">
        {props.group.heading}
      </PaperText>
      <ul class="conv-links">
        <For each={props.group.links}>
          {(l) => (
            <li>
              <a href={l.href} data-internal>
                {l.label}
              </a>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}

const CATEGORIES: { id: FormatCategory; title: string }[] = [
  { id: "image", title: "Images" },
  { id: "video", title: "Video" },
  { id: "audio", title: "Audio" },
  { id: "document", title: "Documents" },
  { id: "data", title: "Spreadsheets and data" },
];

/** Every conversion, one row per source format: the format's page, then each target's page. */
function Directory() {
  return (
    <section id="conversions" class="conv-section">
      <PaperText as="h2" preset="subheader">
        All conversions
      </PaperText>
      <For each={CATEGORIES}>
        {(cat) => (
          <PaperFlex gap="half" fullWidth class="conv-directory-group">
            <PaperText as="h3" preset="heading">
              {cat.title}
            </PaperText>
            <PaperCard class="conv-directory">
              <For each={FORMATS.filter((f) => f.category === cat.id)}>
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
            </PaperCard>
          </PaperFlex>
        )}
      </For>
    </section>
  );
}

/** Everything under the converter: the page's copy, FAQ, related pages, the Paperboard card and the directory. */
export function PageContent(props: { copy: PageCopy }) {
  return (
    <>
      <For each={props.copy.sections}>
        {(s) => (
          <section class="conv-section conv-reading">
            <PaperText as="h2" preset="subheader">
              {s.heading}
            </PaperText>
            <For each={s.body}>
              {(p) => (
                <PaperText as="p" preset="body">
                  {p}
                </PaperText>
              )}
            </For>
            <Show when={s.steps}>
              {(steps) => (
                <PaperTextList ordered preset="body" spacing="compact">
                  <For each={steps()}>{(step) => <li>{step}</li>}</For>
                </PaperTextList>
              )}
            </Show>
          </section>
        )}
      </For>

      <Show when={props.copy.faq.length}>
        <section class="conv-section conv-reading">
          <PaperText as="h2" preset="subheader">
            Questions
          </PaperText>
          <For each={props.copy.faq}>
            {(f) => (
              <div class="conv-faq">
                <PaperText as="h3" preset="label">
                  {f.q}
                </PaperText>
                <PaperText as="p" preset="body">
                  {f.a}
                </PaperText>
              </div>
            )}
          </For>
        </section>
      </Show>

      <PaperCard padding="double" class="conv-pitch">
        <img src="/paperboard-64.png" alt="" width="48" height="48" />
        <PaperFlex gap="half" flex minWidth={0}>
          <PaperText as="h2" preset="label">
            PaperConvert runs on your computer. Paperboard runs everything else there too.
          </PaperText>
          <PaperText as="p" preset="body" color="text-subtle">
            Paperboard is a desktop app for the programs you host yourself: a Minecraft server, a Discord bot, a local AI
            model, a terminal. Each one is a panel you install from the Panel Library, and it runs on your machine.
          </PaperText>
        </PaperFlex>
        <PaperButton href={PAPERBOARD_ORIGIN} target="_blank" rel="noopener">
          See Paperboard <PaperIcon zeroHeight aria-hidden="true">north_east</PaperIcon>
        </PaperButton>
      </PaperCard>

      <For each={props.copy.related}>{(g) => <LinkList group={g} />}</For>

      <Directory />
    </>
  );
}
