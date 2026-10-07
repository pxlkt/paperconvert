import { describe, expect, test } from "bun:test";
import { audioKbps, ffmpegFailure, mediaPlan, scaleFilter, x264Crf } from "../src/lib/mediaArgs";
import { DEFAULT_OPTIONS } from "../src/lib/options";
import { CONVERSIONS } from "../src/lib/conversions";

const O = DEFAULT_OPTIONS;
const plan = (from: string, to: string, opts = O) => mediaPlan(from, to, opts, "/job1/in.x", `/out1.${to}`);
const arg = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe("media plans", () => {
  test("every media pair in the table has a plan that reads the input and writes the output", () => {
    for (const c of CONVERSIONS.filter((c) => c.engine === "media")) {
      const attempts = plan(c.from, c.to);
      expect(attempts.length).toBeGreaterThan(0);
      for (const a of attempts) {
        expect(arg(a.args, "-i")).toBe("/job1/in.x");
        expect(a.args.at(-1)).toBe(`/out1.${c.to}`);
      }
    }
  });

  test("a compatible container copies first and re-encodes only if that fails", () => {
    const [copy, encode] = plan("mov", "mp4");
    expect(copy!.args).toContain("copy");
    expect(arg(encode!.args, "-c:v")).toBe("libx264");
    expect(plan("mov", "mp4", { ...O, copyStreams: false })).toHaveLength(1);
    // WebM's VP9/Opus would make an MP4 most players reject: always re-encode
    expect(plan("webm", "mp4")).toHaveLength(1);
  });

  test("muting drops audio in both the copy and the encode", () => {
    for (const a of plan("mov", "mp4", { ...O, muteAudio: true })) expect(a.args).toContain("-an");
  });

  test("audio targets get their codec, video is dropped", () => {
    const codecs: Record<string, string> = { mp3: "libmp3lame", wav: "pcm_s16le", ogg: "libvorbis", flac: "flac", m4a: "aac", aac: "aac", opus: "libopus", aiff: "pcm_s16be", wma: "wmav2" };
    for (const [to, codec] of Object.entries(codecs)) {
      const [a] = plan(to === "mp3" ? "wav" : "mp3", to);
      expect(a!.args).toContain("-vn");
      expect(arg(a!.args, "-c:a")).toBe(codec);
    }
  });

  test("the shareable GIF preset caps width, frame rate and palette", () => {
    const vf = arg(plan("mp4", "gif")[0]!.args, "-vf")!;
    expect(vf).toContain("fps=15");
    expect(vf).toContain("min(480\\,iw)");
    expect(vf).toContain("palettegen=max_colors=128");
    const custom = arg(plan("mp4", "gif", { ...O, shareableGif: false, gifFps: 24, gifColors: 64, resizeMode: "width", width: 320 })[0]!.args, "-vf")!;
    expect(custom).toContain("fps=24");
    expect(custom).toContain("scale=320:-1");
    expect(custom).toContain("max_colors=64");
  });

  test("H.264 output is always even-sized", () => {
    expect(scaleFilter(O, true)).toBe("scale=trunc(iw/2)*2:trunc(ih/2)*2");
    expect(scaleFilter({ ...O, resizeMode: "width", width: 641 }, true)).toContain("scale=642:-2");
    expect(scaleFilter(O, false)).toBeNull();
  });

  test("quality maps onto codec scales", () => {
    expect(x264Crf(85)).toBe(23);
    expect(audioKbps(1)).toBe(64);
    expect(audioKbps(100)).toBe(320);
  });

  test("a file name never becomes a flag: the input path follows -i", () => {
    const [a] = mediaPlan("mp3", "wav", O, "/job1/-y -f lavfi.mp3", "/out1.wav");
    expect(arg(a!.args, "-i")).toBe("/job1/-y -f lavfi.mp3");
  });
});

describe("ffmpeg failures", () => {
  test("the most relevant error line is surfaced", () => {
    expect(ffmpegFailure(["Input #0, mov", "/job1/x.mov: Invalid data found when processing input", "Conversion failed!"]))
      .toBe("FFmpeg could not convert this file: /job1/x.mov: Invalid data found when processing input");
    expect(ffmpegFailure(["frame=1"])).toBe("FFmpeg could not convert this file.");
  });
});
