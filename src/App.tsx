import {
  PaperButton,
  PaperFlex,
  PaperIcon,
  PaperProvider,
  PaperText,
} from "@mileniumhq/paperui";
import "@mileniumhq/paperui/style.css";
import "./app.css";
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { pageCopy, resolvePath, routeIntent, type Route } from "./lib/routes";
import { getFormat } from "./lib/formats";
import { createQueue, type BatchSummary, type Job } from "./lib/queue";
import { convertFile } from "./lib/convert";
import { cancelFFmpeg } from "./lib/ffmpeg";
import { applyHead, NOT_FOUND_COPY } from "./head";
import { Converter } from "./components/Converter";
import { PageContent } from "./components/PageContent";
import { DoneDialog } from "./components/DoneDialog";

export default function App() {
  const [theme, setTheme] = createSignal<"dark" | "light">(
    window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark",
  );
  const [route, setRoute] = createSignal<Route | null>(resolvePath(location.pathname));
  const copy = createMemo(() => {
    const r = route();
    return r ? pageCopy(r) : NOT_FOUND_COPY;
  });

  const queue = createQueue({
    convert: (job, progress) => convertFile(job.file, job.from, job.to, job.options, progress),
    cancel: (engine) => {
      // only FFmpeg runs off the main thread and can be stopped mid-file;
      // the other engines finish and their result is discarded
      if (engine === "media") cancelFFmpeg();
    },
    createUrl: (blob) => URL.createObjectURL(blob),
    revokeUrl: (url) => URL.revokeObjectURL(url),
  });
  const [jobs, setJobs] = createStore<Job[]>([]);
  onCleanup(queue.subscribe((list) => setJobs(reconcile([...list], { key: "id" }))));

  // the "your computer did that" dialog shows once per visit, after the first batch
  const [summary, setSummary] = createSignal<BatchSummary | null>(null);
  let summaryShown = false;
  onCleanup(
    queue.onBatchDone((s) => {
      if (summaryShown) return;
      summaryShown = true;
      setSummary(s);
    }),
  );

  const navigate = (href: string) => {
    const next = resolvePath(new URL(href, location.href).pathname);
    history.pushState(null, "", href);
    setRoute(next);
    applyHead(next, copy());
    window.scrollTo({ top: 0 });
  };

  onMount(() => {
    applyHead(route(), copy());
    const onPop = () => {
      setRoute(resolvePath(location.pathname));
      applyHead(route(), copy());
    };
    // internal links swap the page in place, so the queue survives browsing
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[data-internal]") as HTMLAnchorElement | null;
      if (!a) return;
      e.preventDefault();
      navigate(a.getAttribute("href")!);
    };
    window.addEventListener("popstate", onPop);
    document.addEventListener("click", onClick);
    onCleanup(() => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("click", onClick);
    });
  });

  const intent = createMemo(() => {
    const r = route();
    return r ? routeIntent(r) : {};
  });

  return (
    <PaperProvider theme={theme()} styleBody>
      <div class="conv-page">
        <header class="conv-topbar">
          <div class="conv-topbar-inner">
            <a href="/" data-internal class="conv-brand" aria-label="PaperConvert home">
              <img src="/logo.png" alt="" width="32" height="32" />
              <PaperText rounded weight={800} size={5}>
                PaperConvert
              </PaperText>
            </a>
            <PaperFlex direction="row" align="center" gap="half">
              <PaperButton size="tiny" variant="text" href="#conversions">
                All conversions
              </PaperButton>
              <PaperButton size="tiny" variant="text" href="https://paperboard.dev" target="_blank" rel="noopener">
                Paperboard <PaperIcon zeroHeight aria-hidden="true">open_in_new</PaperIcon>
              </PaperButton>
              <PaperButton
                size="tiny"
                icon
                variant="text"
                onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
                aria-label={theme() === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              >
                {theme() === "dark" ? "light_mode" : "dark_mode"}
              </PaperButton>
            </PaperFlex>
          </div>
        </header>

        <main class="conv-main">
          <section class="conv-hero">
            <Show when={route()?.kind === "pair" ? (route() as Extract<Route, { kind: "pair" }>) : null}>
              {(r) => (
                <div class="conv-pair" aria-hidden="true">
                  <span>{getFormat(r().from).label}</span>
                  <PaperIcon zeroHeight>arrow_forward</PaperIcon>
                  <span>{getFormat(r().to).label}</span>
                </div>
              )}
            </Show>
            <PaperText as="h1" preset="header" rounded class="conv-h1">
              {copy().h1}
            </PaperText>
            <PaperText as="p" size={4} color="text-subtle" class="conv-lead">
              {copy().lead}
            </PaperText>
            <PaperFlex direction="row" gap="half" wrap justify="center" class="conv-promises">
              <span><PaperIcon zeroHeight aria-hidden="true">cloud_off</PaperIcon> No upload</span>
              <span><PaperIcon zeroHeight aria-hidden="true">person_off</PaperIcon> No sign-up</span>
              <span><PaperIcon zeroHeight aria-hidden="true">all_inclusive</PaperIcon> No daily limit</span>
            </PaperFlex>
          </section>

          <Converter queue={queue} jobs={jobs} intent={intent()} />

          <PageContent copy={copy()} />
        </main>

        <footer class="conv-footer">
          <PaperText size={2} color="text-subtle">
            PaperConvert is open source under the MIT license and converts everything inside your browser. It is a side
            project of{" "}
            <a href="https://paperboard.dev" target="_blank" rel="noopener">
              Paperboard
            </a>
            , the dashboard for apps that run on your own computer.
          </PaperText>
        </footer>
      </div>

      <DoneDialog
        summary={summary()}
        job={jobs.find((j) => j.id === summary()?.lastJobId) ?? null}
        onClose={() => setSummary(null)}
      />
    </PaperProvider>
  );
}
