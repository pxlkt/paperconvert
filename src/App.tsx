import { PaperPage, PaperPageHeader, PaperProvider } from "@mileniumhq/paperui";
import "@mileniumhq/paperui/style.css";
import "./app.css";
import { createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { pageCopy, resolvePath, routeIntent, type Route } from "./lib/routes";
import { getFormat } from "./lib/formats";
import { createQueue, type BatchSummary, type Job } from "./lib/queue";
import { convertFile } from "./lib/convert";
import { createTheme } from "./lib/theme";
import { applyHead, NOT_FOUND_COPY } from "./head";
import { Converter } from "./components/Converter";
import { PageContent } from "./components/PageContent";
import { DoneDialog } from "./components/DoneDialog";
import { CATEGORY_ICON } from "./components/JobRow";
import { Topbar } from "./components/Topbar";
import { Footer } from "./components/Footer";

function headerIcon(route: Route | null): string {
  switch (route?.kind) {
    case undefined: return "search_off";
    case "home": return "swap_horiz";
    case "pair": return CATEGORY_ICON[getFormat(route.to).category];
    case "format": return CATEGORY_ICON[getFormat(route.format).category];
    case "compress": return "compress";
    case "resize": return "photo_size_select_large";
  }
}

/** The whole site. `path` is the page to show first; the build prerenders each one through here. */
export default function App(props: { path: string }) {
  const { theme, toggle } = createTheme();
  const [route, setRoute] = createSignal<Route | null>(resolvePath(props.path));
  const copy = createMemo(() => {
    const r = route();
    return r ? pageCopy(r) : NOT_FOUND_COPY;
  });

  const queue = createQueue({
    convert: (job, progress) => convertFile(job.file, job.from, job.to, job.options, progress),
    cancel: (engine) => {
      // only FFmpeg runs off the main thread and can be stopped mid-file;
      // the other engines finish and their result is discarded
      // FFmpeg is only loaded once a media file converts, so before that
      // there is nothing to stop
      if (engine === "media") void import("./lib/ffmpeg").then((m) => m.cancelFFmpeg());
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

  const scrollToHash = (hash: string) => {
    const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (target) target.scrollIntoView();
    else window.scrollTo({ top: 0 });
  };

  const navigate = (href: string) => {
    const url = new URL(href, location.href);
    if (url.pathname !== location.pathname) {
      history.pushState(null, "", url.pathname + url.hash);
      setRoute(resolvePath(url.pathname));
      applyHead(route(), copy());
    } else if (url.hash !== location.hash) {
      history.pushState(null, "", url.hash || url.pathname);
    }
    scrollToHash(url.hash);
  };

  onMount(() => {
    // the prerendered head already matches; this covers the dev server and 404s
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
    <PaperProvider styleBody class="conv-root">
      <Topbar theme={theme()} onToggleTheme={toggle} />

      <main class="conv-main">
        <PaperPage gap="double">
        <PaperPageHeader
          icon={headerIcon(route())}
          title={<h1 class="conv-h1">{copy().h1}</h1>}
          subtitle={copy().lead}
        />
        <Converter queue={queue} jobs={jobs} intent={intent()} />
        <PageContent copy={copy()} directory={route()?.kind === "home" || route() === null} />
        </PaperPage>
      </main>

      <Footer />

      <DoneDialog
        summary={summary()}
        job={jobs.find((j) => j.id === summary()?.lastJobId) ?? null}
        onClose={() => setSummary(null)}
      />
    </PaperProvider>
  );
}
