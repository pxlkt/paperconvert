import {
  PaperButton,
  PaperCard,
  PaperFlex,
  PaperIcon,
  PaperProgress,
  PaperSelectMenu,
  PaperSelectMenuItem,
  PaperText,
} from "@mileniumhq/paperui";
import { createMemo, For, Show } from "solid-js";
import { targetsFor } from "../lib/conversions";
import { getFormat, type FormatCategory } from "../lib/formats";
import { optionGroups } from "../lib/options";
import { formatBytes, savingsPercent } from "../lib/bytes";
import type { Job } from "../lib/queue";

export const CATEGORY_ICON: Record<FormatCategory, string> = {
  image: "image",
  document: "description",
  data: "table_chart",
  audio: "music_note",
  video: "movie",
};

const STAGE_LABEL: Record<string, string> = {
  decode: "Reading",
  encode: "Encoding",
  "copy streams": "Copying streams",
  "encode video": "Encoding video",
  "encode audio": "Encoding audio",
  "encode gif": "Making GIF",
  "encode animated webp": "Making WebP",
  "extract frame": "Picking a frame",
};

export function JobRow(props: {
  job: Job;
  onTarget: (to: string) => void;
  onOptions: () => void;
  onConvert: () => void;
  onRemove: () => void;
}) {
  const from = () => getFormat(props.job.from);
  const locked = () => props.job.status === "converting" || props.job.status === "waiting";
  const hasOptions = createMemo(() => optionGroups(props.job.from, props.job.to, props.job.options).length > 0);
  const saved = () => (props.job.result ? savingsPercent(props.job.file.size, props.job.result.bytes) : 0);
  const stage = () => {
    const s = props.job.stage;
    if (!s) return props.job.status === "waiting" ? "Waiting for the file ahead" : "Converting";
    return STAGE_LABEL[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
  };

  return (
    <PaperCard padding="full" class="conv-job">
      <div class="conv-job-grid">
        <Show
          when={props.job.previewUrl}
          fallback={
            <div class="conv-thumb conv-thumb-icon" aria-hidden="true">
              <PaperIcon zeroHeight>{CATEGORY_ICON[from().category]}</PaperIcon>
            </div>
          }
        >
          <img class="conv-thumb" src={props.job.previewUrl} alt="" loading="lazy" />
        </Show>

        <div class="conv-job-main">
          <PaperText weight={700} size={3} truncate title={props.job.file.name}>
            {props.job.file.name}
          </PaperText>
          <PaperText size={1} color="text-subtle">
            {formatBytes(props.job.file.size)} · {from().label}
            <Show when={props.job.result}>
              {(r) => (
                <>
                  {" → "}
                  {formatBytes(r().bytes)}
                  <Show when={saved() > 0}>
                    <span class="conv-saved"> (−{saved()}%)</span>
                  </Show>
                  <Show when={r().width && r().height}>
                    {" · "}
                    {r().width}×{r().height}
                  </Show>
                  {" · "}
                  {r().elapsedMs < 1000 ? `${Math.max(1, Math.round(r().elapsedMs))} ms` : `${(r().elapsedMs / 1000).toFixed(1)} s`}
                </>
              )}
            </Show>
          </PaperText>

          <Show when={locked()}>
            <div class="conv-job-progress" role="status">
              <PaperText size={1} color="text-subtle">
                {stage()}
                <Show when={props.job.progress !== null}> · {Math.round((props.job.progress ?? 0) * 100)}%</Show>
              </PaperText>
              <Show when={props.job.status === "converting"}>
                <PaperProgress
                  value={props.job.progress === null ? undefined : Math.round(props.job.progress * 100)}
                  aria-label={`Converting ${props.job.file.name}`}
                />
              </Show>
            </div>
          </Show>

          <Show when={props.job.status === "error"}>
            <PaperText size={2} color="danger" role="alert" class="conv-job-error">
              {props.job.error}
            </PaperText>
          </Show>

          <Show when={props.job.result?.warnings.length}>
            <For each={props.job.result!.warnings}>
              {(w) => (
                <PaperText size={2} color="warning" class="conv-job-warning">
                  <PaperIcon zeroHeight aria-hidden="true">warning</PaperIcon> {w}
                </PaperText>
              )}
            </For>
          </Show>
        </div>

        <div class="conv-job-actions">
          <PaperText size={2} color="text-subtle">
            to
          </PaperText>
          <PaperSelectMenu
            name={`target-${props.job.id}`}
            value={props.job.to}
            disabled={locked()}
            onValueChange={(v) => props.onTarget(String(v))}
          >
            <For each={targetsFor(props.job.from)}>
              {(f) => <PaperSelectMenuItem value={f.id}>{f.id === props.job.from ? `${f.label} (re-encode)` : f.label}</PaperSelectMenuItem>}
            </For>
          </PaperSelectMenu>

          <Show when={hasOptions()}>
            <PaperButton
              size="tiny"
              icon
              variant="text"
              disabled={locked()}
              onClick={props.onOptions}
              aria-label={`Settings for ${props.job.file.name}`}
            >
              tune
            </PaperButton>
          </Show>

          <Show
            when={props.job.result}
            fallback={
              <PaperButton
                variant={props.job.status === "error" ? "danger" : "primary"}
                size="small"
                disabled={locked()}
                onClick={props.onConvert}
              >
                <PaperIcon zeroHeight aria-hidden="true">
                  {props.job.status === "error" ? "refresh" : locked() ? "hourglass_top" : "bolt"}
                </PaperIcon>
                {props.job.status === "error" ? "Retry" : "Convert"}
              </PaperButton>
            }
          >
            {(r) => (
              <PaperButton variant="success" size="small" href={r().url} download={r().fileName}>
                <PaperIcon zeroHeight aria-hidden="true">download</PaperIcon> Save
              </PaperButton>
            )}
          </Show>

          <PaperButton
            size="tiny"
            icon
            variant="text"
            onClick={props.onRemove}
            aria-label={`${props.job.status === "converting" ? "Cancel and remove" : "Remove"} ${props.job.file.name}`}
          >
            close
          </PaperButton>
        </div>
      </div>
    </PaperCard>
  );
}
