// ─── FFmpeg runtime ─────────────────────────────────────────────────────────
// One FFmpeg WebAssembly worker for the page. The input file is mounted
// read-only (WORKERFS) instead of copied into memory; the output is read back
// and deleted. Conversions are serialised by the queue, and cancelling one
// terminates the worker: an aborted message alone would leave FFmpeg running.

import { FFmpeg, FFFSType } from "@ffmpeg/ffmpeg";
import coreURL from "@ffmpeg/core?url";
import { ffmpegFailure, mediaPlan } from "./mediaArgs";
import { LIMITS, type ConvertOptions } from "./options";
import { ConversionError, type Progress } from "./errors";
import { formatBytes } from "./bytes";

/** The wasm is too big for the host's per-file limit; jsDelivr serves the same version's file. */
const wasmURL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${__FFMPEG_CORE_VERSION__}/dist/esm/ffmpeg-core.wasm`;

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

async function getFFmpeg(onStage: (stage: string) => void): Promise<FFmpeg> {
  if (instance?.loaded) return instance;
  if (!loading) {
    onStage("Loading the media engine (about 30 MB, once per visit)");
    const ff = new FFmpeg();
    loading = ff
      .load({ coreURL, wasmURL })
      .then(() => {
        instance = ff;
        return ff;
      })
      .catch((err: unknown) => {
        ff.terminate();
        throw new ConversionError(`The media engine failed to load: ${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

/** Stops whatever FFmpeg is doing. The next conversion loads a fresh worker. */
export function cancelFFmpeg(): void {
  instance?.terminate();
  instance = null;
}

let runSeq = 0;

export async function runMedia(
  file: File,
  from: string,
  to: string,
  opts: ConvertOptions,
  progress: Progress,
): Promise<Blob> {
  if (file.size > LIMITS.maxMediaBytes) {
    throw new ConversionError(`This file is ${formatBytes(file.size)}. The in-browser media engine handles up to ${formatBytes(LIMITS.maxMediaBytes)}.`);
  }
  const ff = await getFFmpeg(progress.stage);
  runSeq += 1;
  const dir = `/job${runSeq}`;
  const output = `/out${runSeq}.${to}`;
  const input = `${dir}/${file.name}`;

  const logTail: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    logTail.push(message);
    if (logTail.length > 40) logTail.shift();
  };
  const onProgress = ({ progress: p }: { progress: number }) => {
    if (Number.isFinite(p) && p >= 0 && p <= 1) progress.ratio(p);
  };

  await ff.createDir(dir);
  await ff.mount(FFFSType.WORKERFS, { files: [file] }, dir);
  ff.on("log", onLog);
  ff.on("progress", onProgress);
  try {
    const attempts = mediaPlan(from, to, opts, input, output);
    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i]!;
      progress.stage(attempt.label);
      logTail.length = 0;
      const code = await ff.exec(attempt.args);
      if (code === 0) {
        const data = await ff.readFile(output);
        if (!(data instanceof Uint8Array) || data.byteLength === 0) {
          throw new ConversionError("FFmpeg finished but wrote an empty file.");
        }
        return new Blob([data as Uint8Array<ArrayBuffer>]);
      }
      if (i === attempts.length - 1) throw new ConversionError(ffmpegFailure(logTail));
    }
    throw new ConversionError("FFmpeg had nothing to run.");
  } finally {
    ff.off("log", onLog);
    ff.off("progress", onProgress);
    // a cancelled run has already terminated the worker and its filesystem
    if (instance === ff) {
      const outName = output.slice(1);
      if ((await ff.listDir("/")).some((e) => e.name === outName)) await ff.deleteFile(output);
      await ff.unmount(dir);
      await ff.deleteDir(dir);
    }
  }
}
