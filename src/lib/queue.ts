// ─── Job queue ──────────────────────────────────────────────────────────────
// Files waiting, converting and done. One runner converts one job at a time
// (FFmpeg has one worker, and a browser tab has one main thread to share),
// so "Convert all" is a queue, not a stampede. Framework-free: the UI mirrors
// the snapshot it publishes. Every object URL it makes, it revokes.

import { defaultTarget, findConversion, type Engine } from "./conversions";
import { detectFormat, extensionOf } from "./formats";
import { DEFAULT_OPTIONS, LIMITS, type ConvertOptions } from "./options";
import type { Progress } from "./errors";
import type { ConvertResult } from "./convert";

export type JobStatus = "queued" | "waiting" | "converting" | "done" | "error";

export interface JobResult {
  url: string;
  fileName: string;
  bytes: number;
  width?: number;
  height?: number;
  warnings: string[];
  elapsedMs: number;
}

export interface Job {
  id: string;
  file: File;
  from: string;
  to: string;
  options: ConvertOptions;
  status: JobStatus;
  /** 0..1 within the current stage, or null when the engine reports none */
  progress: number | null;
  stage?: string;
  error?: string;
  previewUrl?: string;
  result?: JobResult;
}

export interface QueueIntent {
  to?: string;
  compress?: boolean;
  resize?: boolean;
}

export interface BatchSummary {
  converted: number;
  failed: number;
  inBytes: number;
  outBytes: number;
  elapsedMs: number;
  /** the last finished job, for the summary dialog's download button */
  lastJobId: string;
}

export interface QueueDeps {
  convert: (job: Job, progress: Progress) => Promise<ConvertResult>;
  /** stops a running conversion of this engine, if it can be stopped */
  cancel: (engine: Engine) => void;
  createUrl: (blob: Blob) => string;
  revokeUrl: (url: string) => void;
}

const PREVIEWABLE = new Set(["png", "jpg", "webp", "avif", "gif", "bmp", "ico", "svg"]);

export function createQueue(deps: QueueDeps) {
  let jobs: Job[] = [];
  let seq = 0;
  let running: string | null = null;
  const pending: string[] = [];
  const listeners = new Set<(jobs: readonly Job[]) => void>();
  const batchListeners = new Set<(s: BatchSummary) => void>();
  let batch: BatchSummary | null = null;

  const publish = () => {
    for (const l of listeners) l(jobs);
  };
  const find = (id: string) => jobs.find((j) => j.id === id);
  const patch = (id: string, p: Partial<Job>) => {
    jobs = jobs.map((j) => (j.id === id ? { ...j, ...p } : j));
    publish();
  };
  const dropResult = (j: Job) => {
    if (j.result) deps.revokeUrl(j.result.url);
  };

  function add(files: File[], intent: QueueIntent = {}): { added: number; rejected: { name: string; reason: string }[] } {
    const rejected: { name: string; reason: string }[] = [];
    const fresh: Job[] = [];
    for (const file of files) {
      const fmt = detectFormat(file);
      if (!fmt) {
        const ext = extensionOf(file.name);
        rejected.push({ name: file.name, reason: ext ? `PaperConvert doesn't read .${ext} files.` : "PaperConvert couldn't tell what kind of file this is." });
        continue;
      }
      if (file.size === 0) {
        rejected.push({ name: file.name, reason: "This file is empty." });
        continue;
      }
      if (jobs.length + fresh.length >= LIMITS.maxQueue) {
        rejected.push({ name: file.name, reason: `The queue holds ${LIMITS.maxQueue} files. Clear some, then add the rest.` });
        continue;
      }
      seq += 1;
      const to = defaultTarget(fmt.id, intent.to);
      const options: ConvertOptions = { ...DEFAULT_OPTIONS };
      if (to === fmt.id && intent.compress) options.quality = 75;
      if (to === fmt.id && intent.resize) Object.assign(options, { resizeMode: "percent", percent: 50 });
      fresh.push({
        id: `job${seq}`,
        file,
        from: fmt.id,
        to,
        options,
        status: "queued",
        progress: null,
        previewUrl: PREVIEWABLE.has(fmt.id) ? deps.createUrl(file) : undefined,
      });
    }
    if (fresh.length) {
      jobs = [...jobs, ...fresh];
      publish();
    }
    return { added: fresh.length, rejected };
  }

  /** Changing what a finished job produces sends it back to the queue. */
  function reconfigure(id: string, p: { to?: string; options?: ConvertOptions }) {
    const j = find(id);
    if (!j || j.status === "converting" || j.status === "waiting") return;
    const to = p.to ?? j.to;
    if (!findConversion(j.from, to)) return;
    dropResult(j);
    patch(id, { to, options: p.options ?? j.options, status: "queued", result: undefined, error: undefined, progress: null, stage: undefined });
  }

  function convert(ids: string[] = jobs.filter((j) => j.status === "queued" || j.status === "error").map((j) => j.id)) {
    for (const id of ids) {
      const j = find(id);
      if (!j || !(j.status === "queued" || j.status === "error")) continue;
      pending.push(id);
      patch(id, { status: "waiting", error: undefined, progress: null, stage: undefined });
    }
    void pump();
  }

  async function pump() {
    if (running) return;
    batch ??= { converted: 0, failed: 0, inBytes: 0, outBytes: 0, elapsedMs: 0, lastJobId: "" };
    while (pending.length) {
      const id = pending.shift()!;
      const job = find(id);
      if (!job || job.status !== "waiting") continue;
      running = id;
      patch(id, { status: "converting", progress: null, stage: undefined });
      const progress: Progress = {
        ratio: (r) => {
          if (running === id && find(id)) patch(id, { progress: Math.max(0, Math.min(1, r)) });
        },
        stage: (s) => {
          if (running === id && find(id)) patch(id, { stage: s, progress: null });
        },
      };
      try {
        const res = await deps.convert(job, progress);
        const current = find(id);
        if (!current || current.status !== "converting") continue; // removed while converting
        const result: JobResult = {
          url: deps.createUrl(res.blob),
          fileName: res.fileName,
          bytes: res.blob.size,
          width: res.width,
          height: res.height,
          warnings: res.warnings,
          elapsedMs: res.elapsedMs,
        };
        patch(id, { status: "done", progress: 1, stage: undefined, result });
        batch.converted += 1;
        batch.inBytes += job.file.size;
        batch.outBytes += result.bytes;
        batch.elapsedMs += result.elapsedMs;
        batch.lastJobId = id;
      } catch (err) {
        if (!find(id)) continue;
        batch.failed += 1;
        patch(id, { status: "error", progress: null, stage: undefined, error: err instanceof Error ? err.message : String(err) });
      } finally {
        running = null;
      }
    }
    const done = batch;
    batch = null;
    if (done.converted > 0) for (const l of batchListeners) l(done);
  }

  function remove(id: string) {
    const j = find(id);
    if (!j) return;
    const idx = pending.indexOf(id);
    if (idx >= 0) pending.splice(idx, 1);
    if (running === id) deps.cancel(findConversion(j.from, j.to)!.engine);
    if (j.previewUrl) deps.revokeUrl(j.previewUrl);
    dropResult(j);
    jobs = jobs.filter((x) => x.id !== id);
    publish();
  }

  function clear() {
    for (const j of [...jobs]) remove(j.id);
  }

  return {
    add,
    reconfigure,
    convert,
    remove,
    clear,
    get jobs(): readonly Job[] {
      return jobs;
    },
    subscribe(fn: (jobs: readonly Job[]) => void) {
      listeners.add(fn);
      fn(jobs);
      return () => listeners.delete(fn);
    },
    onBatchDone(fn: (s: BatchSummary) => void) {
      batchListeners.add(fn);
      return () => batchListeners.delete(fn);
    },
  };
}

export type Queue = ReturnType<typeof createQueue>;
