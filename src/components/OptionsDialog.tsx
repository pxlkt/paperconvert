import {
  PaperButton,
  PaperEffect,
  PaperFlex,
  PaperInput,
  PaperModal,
  PaperRange,
  PaperSelectMenu,
  PaperSelectMenuItem,
  PaperSettingItem,
  PaperSettingList,
  PaperText,
  PaperToggle,
} from "@mileniumhq/paperui";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { findConversion, targetsFor } from "../lib/conversions";
import { getFormat } from "../lib/formats";
import { audioKbps } from "../lib/mediaArgs";
import { DEFAULT_OPTIONS, LIMITS, optionGroups, type ConvertOptions, type ResizeMode } from "../lib/options";
import type { Job } from "../lib/queue";

const VIDEO = new Set(["mp4", "webm", "mov", "mkv", "avi"]);

export function OptionsDialog(props: {
  job: Job | null;
  onClose: () => void;
  onApply: (id: string, to: string, options: ConvertOptions) => void;
}) {
  const [to, setTo] = createSignal("");
  const [draft, setDraft] = createSignal<ConvertOptions>({ ...DEFAULT_OPTIONS });

  createEffect(() => {
    const j = props.job;
    if (j) {
      setTo(j.to);
      setDraft({ ...j.options });
    }
  });

  const update = (patch: Partial<ConvertOptions>) => setDraft((d) => ({ ...d, ...patch }));
  const groups = createMemo(() => (props.job ? optionGroups(props.job.from, to(), draft()) : []));
  const has = (g: string) => groups().includes(g as never);
  const engine = () => (props.job ? findConversion(props.job.from, to())?.engine : undefined);
  const audioOut = () => getFormat(to() || "png").category === "audio";

  const qualityLabel = () => {
    const q = draft().quality;
    if (audioOut()) return `Bitrate: ${audioKbps(q)} kbit/s`;
    if (VIDEO.has(to())) return `Video quality: ${q}`;
    return `Quality: ${q}%`;
  };

  const numberInput = (label: string, value: number | undefined, max: number, set: (n: number | undefined) => void) => (
    <PaperInput
      type="number"
      compact
      min={1}
      max={max}
      placeholder={label}
      aria-label={label}
      value={value ?? ""}
      onInput={(e) => {
        const n = Number(e.currentTarget.value);
        set(Number.isFinite(n) && n > 0 ? Math.min(max, Math.round(n)) : undefined);
      }}
      style={{ width: "var(--paper-size-field-small)" }}
    />
  );

  const apply = () => {
    const j = props.job;
    if (j) props.onApply(j.id, to(), draft());
    props.onClose();
  };

  return (
    <PaperModal
      open={props.job !== null}
      onClose={props.onClose}
      title={props.job ? `Settings: ${props.job.file.name}` : "Settings"}
      size="medium"
      noPadding
      footer={
        <PaperFlex direction="row" justify="flex-end" gap="half" fullWidth>
          <PaperButton variant="text" onClick={props.onClose}>
            Cancel
          </PaperButton>
          <PaperEffect>
            <PaperButton variant="primary" onClick={apply}>
              Apply
            </PaperButton>
          </PaperEffect>
        </PaperFlex>
      }
    >
      <Show when={props.job}>
        {(job) => (
          <PaperSettingList autoHeight>
            <PaperSettingItem title="Convert to" description={`From ${getFormat(job().from).label}`}>
              <PaperSelectMenu name="opt-target" value={to()} onValueChange={(v) => setTo(String(v))}>
                <For each={targetsFor(job().from)}>{(f) => <PaperSelectMenuItem value={f.id}>{f.label}</PaperSelectMenuItem>}</For>
              </PaperSelectMenu>
            </PaperSettingItem>

            <Show when={has("copy")}>
              <PaperSettingItem
                title="Copy streams when possible"
                description="Keeps the original video and audio untouched, so it finishes in seconds with no quality loss. Turn off to re-encode with your own settings."
              >
                <PaperToggle aria-label="Copy streams when possible" checked={draft().copyStreams} onChange={(v) => update({ copyStreams: v })} />
              </PaperSettingItem>
            </Show>

            <Show when={has("quality")}>
              <PaperSettingItem
                title={qualityLabel()}
                description={audioOut() ? "Higher sounds better and makes larger files." : "Higher looks better and makes larger files."}
              >
                <PaperRange
                  aria-label={qualityLabel()}
                  min={1}
                  max={100}
                  value={draft().quality}
                  valueText={(v) => (audioOut() ? `${audioKbps(v)} kilobits per second` : `${v} percent`)}
                  onInput={(v) => update({ quality: v })}
                  style={{ width: "var(--paper-size-field-medium)" }}
                />
              </PaperSettingItem>
            </Show>

            <Show when={has("gif") && engine() === "media"}>
              <PaperSettingItem
                title="Shareable GIF"
                description="At most 480 px wide, 15 frames per second and 128 colours: small enough for Discord, Slack and messages."
              >
                <PaperToggle aria-label="Shareable GIF" checked={draft().shareableGif} onChange={(v) => update({ shareableGif: v })} />
              </PaperSettingItem>
              <Show when={!draft().shareableGif}>
                <PaperSettingItem title="Frame rate" description="Frames per second in the GIF.">
                  <PaperSelectMenu name="gifFps" value={draft().gifFps} onValueChange={(v) => update({ gifFps: Number(v) })}>
                    <For each={[10, 12, 15, 20, 24, 30]}>{(n) => <PaperSelectMenuItem value={n}>{`${n} fps`}</PaperSelectMenuItem>}</For>
                  </PaperSelectMenu>
                </PaperSettingItem>
              </Show>
            </Show>

            <Show when={has("gif") && (engine() === "image" || !draft().shareableGif)}>
              <PaperSettingItem title="Colours" description="GIF holds at most 256. Fewer colours make smaller files.">
                <PaperSelectMenu name="gifColors" value={draft().gifColors} onValueChange={(v) => update({ gifColors: Number(v) })}>
                  <For each={[256, 128, 64, 32, 16]}>{(n) => <PaperSelectMenuItem value={n}>{`${n} colours`}</PaperSelectMenuItem>}</For>
                </PaperSelectMenu>
              </PaperSettingItem>
            </Show>

            <Show when={has("resize")}>
              <PaperSettingItem title="Size" description="Width and height keep the proportions; exact size stretches.">
                <PaperSelectMenu
                  name="resizeMode"
                  value={draft().resizeMode}
                  onValueChange={(v) => update({ resizeMode: v as ResizeMode })}
                >
                  <PaperSelectMenuItem value="original">Original size</PaperSelectMenuItem>
                  <PaperSelectMenuItem value="width">Set width</PaperSelectMenuItem>
                  <PaperSelectMenuItem value="height">Set height</PaperSelectMenuItem>
                  <PaperSelectMenuItem value="exact">Exact size</PaperSelectMenuItem>
                  <PaperSelectMenuItem value="percent">Percentage</PaperSelectMenuItem>
                </PaperSelectMenu>
              </PaperSettingItem>
              <Show when={draft().resizeMode === "width" || draft().resizeMode === "exact"}>
                <PaperSettingItem title="Width" description="In pixels.">
                  {numberInput("Width in pixels", draft().width, LIMITS.resizeMax, (n) => update({ width: n }))}
                </PaperSettingItem>
              </Show>
              <Show when={draft().resizeMode === "height" || draft().resizeMode === "exact"}>
                <PaperSettingItem title="Height" description="In pixels.">
                  {numberInput("Height in pixels", draft().height, LIMITS.resizeMax, (n) => update({ height: n }))}
                </PaperSettingItem>
              </Show>
              <Show when={draft().resizeMode === "percent"}>
                <PaperSettingItem title="Percentage" description={`1 to ${LIMITS.percentMax}% of the original.`}>
                  {numberInput("Percentage", draft().percent, LIMITS.percentMax, (n) => update({ percent: n }))}
                </PaperSettingItem>
              </Show>
            </Show>

            <Show when={has("fps")}>
              <PaperSettingItem title="Frame rate" description="Frames per second in the video.">
                <PaperSelectMenu name="videoFps" value={draft().videoFps} onValueChange={(v) => update({ videoFps: Number(v) })}>
                  <PaperSelectMenuItem value={0}>Same as source</PaperSelectMenuItem>
                  <For each={[24, 30, 60]}>{(n) => <PaperSelectMenuItem value={n}>{`${n} fps`}</PaperSelectMenuItem>}</For>
                </PaperSelectMenu>
              </PaperSettingItem>
            </Show>

            <Show when={has("mute")}>
              <PaperSettingItem title="Remove audio" description="Save the video without its soundtrack.">
                <PaperToggle aria-label="Remove audio" checked={draft().muteAudio} onChange={(v) => update({ muteAudio: v })} />
              </PaperSettingItem>
            </Show>

            <Show when={has("pdf")}>
              <PaperSettingItem title="Resolution" description="Higher DPI gives sharper, larger page images.">
                <PaperSelectMenu name="pdfDpi" value={draft().pdfDpi} onValueChange={(v) => update({ pdfDpi: Number(v) })}>
                  <PaperSelectMenuItem value={72}>72 DPI (screen)</PaperSelectMenuItem>
                  <PaperSelectMenuItem value={150}>150 DPI (standard)</PaperSelectMenuItem>
                  <PaperSelectMenuItem value={300}>300 DPI (print)</PaperSelectMenuItem>
                </PaperSelectMenu>
              </PaperSettingItem>
            </Show>

            <Show when={has("background")}>
              <PaperSettingItem title="Background" description={`${getFormat(to()).label} has no transparency; transparent areas get this colour.`}>
                <PaperFlex direction="row" align="center" gap="half">
                  <input
                    type="color"
                    class="conv-color-input"
                    aria-label="Background colour"
                    value={draft().background}
                    onInput={(e) => update({ background: e.currentTarget.value })}
                  />
                  <PaperText size={2} family="code">
                    {draft().background}
                  </PaperText>
                </PaperFlex>
              </PaperSettingItem>
            </Show>

            <Show when={groups().length === 0}>
              <PaperSettingItem title="Nothing to tune" description={`${getFormat(job().from).label} to ${getFormat(to()).label} has no settings.`} />
            </Show>
          </PaperSettingList>
        )}
      </Show>
    </PaperModal>
  );
}
