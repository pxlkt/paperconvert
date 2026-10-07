import {
  PaperButton,
  PaperCard,
  PaperEffect,
  PaperFlex,
  PaperIcon,
  PaperSectionHeader,
  PaperText,
} from "@mileniumhq/paperui";
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { ACCEPT, getFormat } from "../lib/formats";
import type { Job, Queue, QueueIntent } from "../lib/queue";
import { JobRow } from "./JobRow";
import { OptionsDialog } from "./OptionsDialog";

export function Converter(props: { queue: Queue; jobs: Job[]; intent: QueueIntent & { from?: string } }) {
  const [dragging, setDragging] = createSignal(false);
  const [rejected, setRejected] = createSignal<{ name: string; reason: string }[]>([]);
  const [optionsFor, setOptionsFor] = createSignal<string | null>(null);
  let input: HTMLInputElement | undefined;

  const add = (files: Iterable<File>) => {
    const list = [...files];
    if (!list.length) return;
    const res = props.queue.add(list, props.intent);
    setRejected(res.rejected);
  };

  const busy = createMemo(() => props.jobs.some((j) => j.status === "converting" || j.status === "waiting"));
  const convertible = createMemo(() => props.jobs.filter((j) => j.status === "queued" || j.status === "error").length);
  const sourceLabel = () => (props.intent.from ? getFormat(props.intent.from).label : null);

  // the whole window accepts drops: once the queue has files the drop box is
  // small, and a missed drop would make the browser open the file instead
  onMount(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      add(e.dataTransfer?.files ?? []);
    };
    const paste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files?.length) {
        e.preventDefault();
        add(files);
      }
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    window.addEventListener("paste", paste);
    onCleanup(() => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
      window.removeEventListener("paste", paste);
    });
  });

  const optionsJob = createMemo(() => props.jobs.find((j) => j.id === optionsFor()) ?? null);

  return (
    <section class="conv-tool" aria-label="Converter">
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.currentTarget.files) add(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />

      <div
        class="conv-drop"
        classList={{ dragging: dragging(), compact: props.jobs.length > 0 }}
        onClick={(e) => {
          if (!(e.target as Element).closest("button")) input?.click();
        }}
      >
        <PaperIcon zeroHeight class="conv-drop-icon" aria-hidden="true">
          {dragging() ? "download" : "upload_file"}
        </PaperIcon>
        <PaperFlex gap="onefourth" align="center">
          <PaperText size={props.jobs.length ? 4 : 6} weight={800}>
            {dragging() ? "Drop to add" : sourceLabel() ? `Drop ${sourceLabel()} files here` : "Drop files here"}
          </PaperText>
          <Show when={!props.jobs.length}>
            <PaperText size={2} color="text-subtle">
              or paste them. Images, video, audio, PDFs, documents and spreadsheets.
            </PaperText>
          </Show>
        </PaperFlex>
        <PaperEffect>
          <PaperButton variant="primary" size={props.jobs.length ? "small" : "medium"} onClick={() => input?.click()}>
            <PaperIcon zeroHeight aria-hidden="true">add</PaperIcon> Select files
          </PaperButton>
        </PaperEffect>
      </div>

      <Show when={rejected().length}>
        <PaperCard accent="warning" padding="full" role="status">
          <PaperFlex direction="row" align="flex-start" justify="space-between" gap="full" fullWidth>
            <PaperFlex gap="onefourth">
              <PaperText weight={700} size={3}>
                {rejected().length === 1 ? "1 file wasn't added" : `${rejected().length} files weren't added`}
              </PaperText>
              <For each={rejected().slice(0, 5)}>
                {(r) => (
                  <PaperText size={2} color="text-subtle">
                    {r.name}: {r.reason}
                  </PaperText>
                )}
              </For>
              <Show when={rejected().length > 5}>
                <PaperText size={2} color="text-subtle">
                  and {rejected().length - 5} more.
                </PaperText>
              </Show>
            </PaperFlex>
            <PaperButton size="tiny" icon variant="text" aria-label="Dismiss" onClick={() => setRejected([])}>
              close
            </PaperButton>
          </PaperFlex>
        </PaperCard>
      </Show>

      <Show when={props.jobs.length}>
        <PaperSectionHeader icon="list" title="Your files" count={props.jobs.length}>
          <PaperButton size="tiny" variant="text" onClick={() => props.queue.clear()}>
            <PaperIcon zeroHeight aria-hidden="true">delete_sweep</PaperIcon> Clear all
          </PaperButton>
        </PaperSectionHeader>

        <ul class="conv-jobs">
          <For each={props.jobs}>
            {(job) => (
              <li>
                <JobRow
                  job={job}
                  onTarget={(to) => props.queue.reconfigure(job.id, { to })}
                  onOptions={() => setOptionsFor(job.id)}
                  onConvert={() => props.queue.convert([job.id])}
                  onRemove={() => props.queue.remove(job.id)}
                />
              </li>
            )}
          </For>
        </ul>

        <PaperFlex direction="row" justify="flex-end" align="center" gap="half" fullWidth>
          <Show when={busy()}>
            <PaperText size={2} color="text-subtle" role="status">
              Converting on this device…
            </PaperText>
          </Show>
          <PaperEffect>
            <PaperButton variant="success" disabled={convertible() === 0} onClick={() => props.queue.convert()}>
              <PaperIcon zeroHeight aria-hidden="true">bolt</PaperIcon>
              {convertible() > 1 ? `Convert all ${convertible()}` : "Convert"}
            </PaperButton>
          </PaperEffect>
        </PaperFlex>
      </Show>

      <OptionsDialog
        job={optionsJob()}
        onClose={() => setOptionsFor(null)}
        onApply={(id, to, options) => props.queue.reconfigure(id, { to, options })}
      />
    </section>
  );
}
