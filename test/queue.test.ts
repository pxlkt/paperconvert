import { describe, expect, test } from "bun:test";
import { createQueue, type BatchSummary, type Job, type QueueDeps } from "../src/lib/queue";
import type { ConvertResult } from "../src/lib/convert";
import { LIMITS } from "../src/lib/options";

function harness(convertImpl?: (job: Job) => Promise<ConvertResult>) {
  const live = new Set<string>();
  let n = 0;
  const cancelled: string[] = [];
  const started: string[] = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  const deps: QueueDeps = {
    convert: async (job) => {
      started.push(job.id);
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      try {
        if (convertImpl) return await convertImpl(job);
        await Bun.sleep(1);
        return { blob: new Blob(["out"]), fileName: `x.${job.to}`, warnings: [], elapsedMs: 1 };
      } finally {
        concurrent--;
      }
    },
    cancel: (engine) => cancelled.push(engine),
    createUrl: () => {
      const u = `blob:${++n}`;
      live.add(u);
      return u;
    },
    revokeUrl: (u) => {
      expect(live.has(u)).toBe(true);
      live.delete(u);
    },
  };
  const q = createQueue(deps);
  const batches: BatchSummary[] = [];
  q.onBatchDone((b) => batches.push(b));
  return { q, live, cancelled, started, batches, maxConcurrent: () => maxConcurrent };
}

const file = (name: string, body = "data") => new File([body], name);
const settle = () => Bun.sleep(20);

describe("queue", () => {
  test("unknown, empty and over-cap files are refused with a reason", () => {
    const { q } = harness();
    const r = q.add([file("a.xyz"), file("b.png", ""), file("c.png")]);
    expect(r.added).toBe(1);
    expect(r.rejected.map((x) => x.reason)).toEqual(["PaperConvert doesn't read .xyz files.", "This file is empty."]);
    const many = Array.from({ length: LIMITS.maxQueue + 5 }, (_, i) => file(`${i}.png`));
    const r2 = q.add(many);
    expect(q.jobs.length).toBe(LIMITS.maxQueue);
    expect(r2.rejected).toHaveLength(6);
  });

  test("a page's target is used when the file can reach it", () => {
    const { q } = harness();
    q.add([file("a.png"), file("b.mp3")], { to: "webp" });
    expect(q.jobs.map((j) => j.to)).toEqual(["webp", "wav"]);
    q.add([file("c.jpg")], { to: "jpg", compress: true });
    expect(q.jobs[2]!.options.quality).toBe(75);
  });

  test("convert all runs one job at a time and reports one batch", async () => {
    const h = harness();
    h.q.add([file("a.png"), file("b.png"), file("c.png")]);
    h.q.convert();
    await settle();
    expect(h.maxConcurrent()).toBe(1);
    expect(h.q.jobs.every((j) => j.status === "done")).toBe(true);
    expect(h.batches).toHaveLength(1);
    expect(h.batches[0]!.converted).toBe(3);
  });

  test("a failure is shown on its row and does not stop the batch", async () => {
    const h = harness(async (job) => {
      if (job.file.name === "bad.png") throw new Error("broken file");
      return { blob: new Blob(["x"]), fileName: "x", warnings: [], elapsedMs: 1 };
    });
    h.q.add([file("bad.png"), file("ok.png")]);
    h.q.convert();
    await settle();
    expect(h.q.jobs.map((j) => [j.status, j.error])).toEqual([["error", "broken file"], ["done", undefined]]);
    expect(h.batches[0]).toMatchObject({ converted: 1, failed: 1 });
  });

  test("removing a converting job cancels its engine and discards the result", async () => {
    let release!: () => void;
    const h = harness(() => new Promise((res) => {
      release = () => res({ blob: new Blob(["x"]), fileName: "x", warnings: [], elapsedMs: 1 });
    }));
    h.q.add([file("clip.mov")]);
    const id = h.q.jobs[0]!.id;
    h.q.convert();
    await settle();
    expect(h.q.jobs[0]!.status).toBe("converting");
    h.q.remove(id);
    expect(h.cancelled).toEqual(["media"]);
    release();
    await settle();
    expect(h.q.jobs).toHaveLength(0);
    expect(h.live.size).toBe(0);
    expect(h.batches).toHaveLength(0);
  });

  test("retargeting a finished job revokes its result and queues it again", async () => {
    const h = harness();
    h.q.add([file("a.png")]);
    h.q.convert();
    await settle();
    expect(h.live.size).toBe(2); // preview + result
    h.q.reconfigure(h.q.jobs[0]!.id, { to: "webp" });
    expect(h.q.jobs[0]).toMatchObject({ status: "queued", to: "webp", result: undefined });
    expect(h.live.size).toBe(1);
    // a target the file cannot reach is ignored
    h.q.reconfigure(h.q.jobs[0]!.id, { to: "mp3" });
    expect(h.q.jobs[0]!.to).toBe("webp");
  });

  test("clear revokes every URL it made", async () => {
    const h = harness();
    h.q.add([file("a.png"), file("b.svg"), file("c.csv")]);
    h.q.convert();
    await settle();
    h.q.clear();
    expect(h.q.jobs).toHaveLength(0);
    expect(h.live.size).toBe(0);
  });
});
