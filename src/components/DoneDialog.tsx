import { PaperButton, PaperEffect, PaperFlex, PaperGrid, PaperIcon, PaperModal, PaperStatTile, PaperText } from "@mileniumhq/paperui";
import { createMemo, Show } from "solid-js";
import { formatBytes, savingsPercent } from "../lib/bytes";
import { getRandomCopy } from "../lib/paperboardCopies";
import type { BatchSummary, Job } from "../lib/queue";

/** "Your computer did that": the Paperboard pitch, shown after the first batch of a visit. */
export function DoneDialog(props: { summary: BatchSummary | null; job: Job | null; onClose: () => void }) {
  const copy = createMemo(() => (props.summary ? getRandomCopy() : null));
  const time = () => {
    const ms = props.summary?.elapsedMs ?? 0;
    return ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`;
  };
  const change = () => {
    const s = props.summary;
    if (!s) return "";
    const p = savingsPercent(s.inBytes, s.outBytes);
    return p > 0 ? `${p}% smaller` : p < 0 ? `${-p}% larger` : "Same size";
  };

  return (
    <PaperModal
      open={props.summary !== null}
      onClose={props.onClose}
      title={props.summary && props.summary.converted > 1 ? `${props.summary.converted} files converted` : "Converted"}
      size="medium"
      footer={
        <PaperFlex direction="row" justify="space-between" align="center" fullWidth wrap gap="half">
          <PaperButton variant="text" href="https://paperboard.dev" target="_blank" rel="noopener">
            Discover Paperboard <PaperIcon zeroHeight aria-hidden="true">open_in_new</PaperIcon>
          </PaperButton>
          <Show
            when={props.summary?.converted === 1 && props.job?.result}
            fallback={
              <PaperButton variant="primary" onClick={props.onClose}>
                Back to my files
              </PaperButton>
            }
          >
            {(r) => (
              <PaperEffect>
                <PaperButton variant="success" href={r().url} download={r().fileName} onClick={props.onClose}>
                  <PaperIcon zeroHeight aria-hidden="true">download</PaperIcon> Save {r().fileName}
                </PaperButton>
              </PaperEffect>
            )}
          </Show>
        </PaperFlex>
      }
    >
      <Show when={props.summary && copy()}>
        <PaperFlex gap="double" fullWidth>
          <PaperFlex gap="half">
            <PaperText as="p" size={7} weight={800} rounded class="conv-balance">
              {copy()!.tagline}
            </PaperText>
            <PaperText as="p" size={3} color="text-subtle" class="conv-pretty">
              {copy()!.text}
            </PaperText>
          </PaperFlex>
          <PaperGrid min="var(--paper-size-field-medium)">
            <PaperStatTile icon="timer" tone="primary" label="Converting time" value={time()} />
            <PaperStatTile icon="cloud_off" tone="success" label="Uploaded" value="0 bytes" />
            <PaperStatTile
              icon="compress"
              tone="extra-1"
              label={`${formatBytes(props.summary!.inBytes)} → ${formatBytes(props.summary!.outBytes)}`}
              value={change()}
            />
          </PaperGrid>
          <Show when={props.summary!.failed > 0}>
            <PaperText size={2} color="danger">
              {props.summary!.failed === 1 ? "1 file failed" : `${props.summary!.failed} files failed`}; the reason is on its row.
            </PaperText>
          </Show>
        </PaperFlex>
      </Show>
    </PaperModal>
  );
}
