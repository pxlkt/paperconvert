// ─── FFmpeg argument plans ──────────────────────────────────────────────────
// Pure: turns a conversion and its options into FFmpeg argv arrays. Each plan
// is a list of attempts run in order; a later attempt runs only when the one
// before it exits non-zero (a stream copy that the container refuses falls
// back to a real encode). The runtime lives in ffmpeg.ts.

import { canCopyStreams, type ConvertOptions } from "./options";

export interface MediaAttempt {
  label: string;
  args: string[];
}

/** 1..100 quality to an audio bitrate in kbit/s. */
export function audioKbps(quality: number): number {
  const steps = [64, 96, 128, 160, 192, 256, 320];
  return steps[Math.min(steps.length - 1, Math.floor((quality / 100) * steps.length))]!;
}

/** 1..100 quality to an x264 CRF (lower is better). 85 maps to 23, x264's default. */
export function x264Crf(quality: number): number {
  return Math.round(51 - quality * 0.33);
}

/** 1..100 quality to a libvpx CRF (4..63). */
export function vpxCrf(quality: number): number {
  return Math.max(4, Math.min(63, Math.round(63 - quality * 0.5)));
}

/** 1..100 quality to an MPEG-4 Part 2 / MJPEG qscale (2 best..31 worst). */
export function qscale(quality: number): number {
  return Math.max(2, Math.min(31, Math.round(31 - quality * 0.29)));
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** FFmpeg scale filter for the resize setting, or null for original size. */
export function scaleFilter(opts: ConvertOptions, forceEven: boolean): string | null {
  const { resizeMode, width, height, percent } = opts;
  const dim = (n: number) => String(forceEven ? even(n) : Math.max(1, Math.round(n)));
  const auto = forceEven ? "-2" : "-1";
  if (resizeMode === "width" && width) return `scale=${dim(width)}:${auto}:flags=lanczos`;
  if (resizeMode === "height" && height) return `scale=${auto}:${dim(height)}:flags=lanczos`;
  if (resizeMode === "exact" && width && height) return `scale=${dim(width)}:${dim(height)}:flags=lanczos`;
  if (resizeMode === "percent" && percent && percent !== 100) {
    const p = percent / 100;
    return forceEven
      ? `scale=trunc(iw*${p}/2)*2:trunc(ih*${p}/2)*2:flags=lanczos`
      : `scale=max(1\\,trunc(iw*${p})):max(1\\,trunc(ih*${p})):flags=lanczos`;
  }
  // H.264 and friends reject odd sizes even when nothing is resized
  return forceEven ? "scale=trunc(iw/2)*2:trunc(ih/2)*2" : null;
}

function gifFilter(opts: ConvertOptions): string {
  const fps = opts.shareableGif ? 15 : opts.gifFps;
  const colors = opts.shareableGif ? 128 : opts.gifColors;
  const scale = opts.shareableGif ? "scale=min(480\\,iw):-1:flags=lanczos" : scaleFilter(opts, false);
  const chain = [`fps=${fps}`, scale].filter(Boolean).join(",");
  return `${chain},split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`;
}

function audioArgs(to: string, opts: ConvertOptions): string[] {
  const k = `${audioKbps(opts.quality)}k`;
  switch (to) {
    case "mp3": return ["-c:a", "libmp3lame", "-b:a", k];
    case "wav": return ["-c:a", "pcm_s16le"];
    case "ogg": return ["-c:a", "libvorbis", "-b:a", k];
    case "flac": return ["-c:a", "flac"];
    case "m4a":
    case "aac": return ["-c:a", "aac", "-b:a", k];
    case "opus": return ["-c:a", "libopus", "-b:a", `${Math.min(256, audioKbps(opts.quality))}k`];
    case "aiff": return ["-c:a", "pcm_s16be"];
    case "wma": return ["-c:a", "wmav2", "-b:a", `${Math.min(192, audioKbps(opts.quality))}k`];
    default: throw new Error(`No audio encoder for ${to}.`);
  }
}

function videoEncodeArgs(to: string, opts: ConvertOptions): string[] {
  const filters = [scaleFilter(opts, true)].filter(Boolean) as string[];
  const vf = filters.length ? ["-vf", filters.join(",")] : [];
  const fps = opts.videoFps > 0 ? ["-r", String(opts.videoFps)] : [];
  const audio = opts.muteAudio ? ["-an"] : null;
  switch (to) {
    case "mp4":
    case "mov":
    case "mkv":
      return [
        ...vf, ...fps,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", String(x264Crf(opts.quality)), "-pix_fmt", "yuv420p",
        ...(audio ?? ["-c:a", "aac", "-b:a", "160k"]),
        ...(to === "mkv" ? [] : ["-movflags", "+faststart"]),
      ];
    case "webm":
      return [
        ...vf, ...fps,
        "-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8",
        "-crf", String(vpxCrf(opts.quality)), "-b:v", "4M", "-pix_fmt", "yuv420p",
        ...(audio ?? ["-c:a", "libopus", "-b:a", "128k"]),
      ];
    case "avi":
      return [
        ...vf, ...fps,
        "-c:v", "mpeg4", "-q:v", String(qscale(opts.quality)), "-pix_fmt", "yuv420p",
        ...(audio ?? ["-c:a", "libmp3lame", "-b:a", "192k"]),
      ];
    default:
      throw new Error(`No video encoder for ${to}.`);
  }
}

const AUDIO_TARGETS = new Set(["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus", "aiff", "wma"]);
const VIDEO_TARGETS = new Set(["mp4", "webm", "mov", "mkv", "avi"]);

/**
 * The attempts for one media conversion. `input` and `output` are paths
 * inside FFmpeg's filesystem; argv is never passed through a shell.
 */
export function mediaPlan(from: string, to: string, opts: ConvertOptions, input: string, output: string): MediaAttempt[] {
  const head = ["-hide_banner", "-nostdin", "-y", "-i", input];

  if (AUDIO_TARGETS.has(to)) {
    return [{ label: "encode audio", args: [...head, "-vn", "-map_metadata", "0", ...audioArgs(to, opts), output] }];
  }

  if (to === "gif") {
    return [{ label: "encode gif", args: [...head, "-vf", gifFilter(opts), "-loop", "0", output] }];
  }

  if (to === "png" || to === "jpg" || to === "webp") {
    // a single still: from a GIF its first frame is animation-true only for
    // webp, which keeps every frame; from video, a representative frame
    const scale = scaleFilter(opts, false);
    if (from === "gif" && to === "webp") {
      return [{
        label: "encode animated webp",
        args: [...head, ...(scale ? ["-vf", scale] : []), "-c:v", "libwebp", "-quality", String(opts.quality), "-loop", "0", output],
      }];
    }
    const vf = ["thumbnail=60", scale].filter(Boolean).join(",");
    const codec =
      to === "png" ? ["-c:v", "png"]
      : to === "jpg" ? ["-c:v", "mjpeg", "-q:v", String(qscale(opts.quality))]
      : ["-c:v", "libwebp", "-quality", String(opts.quality)];
    return [{ label: "extract frame", args: [...head, "-vf", vf, "-frames:v", "1", "-update", "1", ...codec, output] }];
  }

  if (VIDEO_TARGETS.has(to)) {
    const encode: MediaAttempt = { label: "encode video", args: [...head, ...videoEncodeArgs(to, opts), output] };
    if (opts.copyStreams && canCopyStreams(from, to)) {
      const copy: MediaAttempt = {
        label: "copy streams",
        args: [
          ...head, "-map", "0:v:0", ...(opts.muteAudio ? [] : ["-map", "0:a?"]),
          "-c", "copy", ...(opts.muteAudio ? ["-an"] : []),
          ...(to === "mkv" ? [] : ["-movflags", "+faststart"]),
          output,
        ],
      };
      return [copy, encode];
    }
    return [encode];
  }

  throw new Error(`FFmpeg has no plan for ${from} to ${to}.`);
}

/** The most useful line FFmpeg printed before failing. */
export function ffmpegFailure(log: string[]): string {
  const meaningful = log
    .map((l) => l.trim())
    .filter((l) => l && !/^(Aborted\(\)|Conversion failed!|frame=|size=|video:|\s*Stream #|\s*Duration:|Input #|Output #|Press \[q\])/i.test(l));
  const line = [...meaningful].reverse().find((l) => /error|invalid|not supported|unsupported|could not|no such|failed|unknown|does not contain/i.test(l));
  return line ? `FFmpeg could not convert this file: ${line}` : "FFmpeg could not convert this file.";
}
