import { PaperButton, PaperCard, PaperFlex, PaperIcon, PaperText } from "@mileniumhq/paperui";
import { For, Show } from "solid-js";
import { directory, type LinkGroup, type PageCopy } from "../lib/routes";

function Links(props: { group: LinkGroup; level: "h2" | "h3" }) {
  return (
    <div class="conv-linkgroup">
      <PaperText as={props.level} size={props.level === "h2" ? 6 : 4} weight={700}>
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
    </div>
  );
}

/** Everything under the converter: the page's copy, FAQ, related pages, the pitch and the directory. */
export function PageContent(props: { copy: PageCopy }) {
  return (
    <>
      <Show when={props.copy.sections.length}>
        <section class="conv-prose">
          <For each={props.copy.sections}>
            {(s) => (
              <div>
                <PaperText as="h2" size={6} weight={700}>
                  {s.heading}
                </PaperText>
                <For each={s.body}>
                  {(p) => (
                    <PaperText as="p" size={3} color="text-subtle">
                      {p}
                    </PaperText>
                  )}
                </For>
              </div>
            )}
          </For>
        </section>
      </Show>

      <PaperCard padding="double" class="conv-pitch" surface="raised">
        <PaperFlex direction="row" align="center" gap="double" wrap fullWidth>
          <img src="/logo.png" alt="" width="56" height="56" />
          <PaperFlex gap="onefourth" style={{ flex: 1, "min-width": "var(--paper-size-field-medium)" }}>
            <PaperText as="h2" size={6} weight={800} rounded>
              Your computer just did that. Imagine what else it could run.
            </PaperText>
            <PaperText as="p" size={3} color="text-subtle">
              PaperConvert is a small taste of Paperboard: a dashboard for apps that run on your own machine. Discord bots,
              game servers, terminals and AI chat as panels you install, with no cloud bill and no one else's servers.
            </PaperText>
          </PaperFlex>
          <PaperButton variant="primary" href="https://paperboard.dev" target="_blank" rel="noopener">
            See Paperboard <PaperIcon zeroHeight aria-hidden="true">open_in_new</PaperIcon>
          </PaperButton>
        </PaperFlex>
      </PaperCard>

      <Show when={props.copy.faq.length}>
        <section class="conv-prose">
          <PaperText as="h2" size={6} weight={700}>
            Questions
          </PaperText>
          <For each={props.copy.faq}>
            {(f) => (
              <div>
                <PaperText as="h3" size={4} weight={700}>
                  {f.q}
                </PaperText>
                <PaperText as="p" size={3} color="text-subtle">
                  {f.a}
                </PaperText>
              </div>
            )}
          </For>
        </section>
      </Show>

      <For each={props.copy.related}>{(g) => <Links group={g} level="h2" />}</For>

      <section id="conversions" class="conv-directory">
        <PaperText as="h2" size={8} weight={800} rounded>
          All conversions
        </PaperText>
        <For each={directory()}>{(g) => <Links group={g} level="h3" />}</For>
      </section>
    </>
  );
}
