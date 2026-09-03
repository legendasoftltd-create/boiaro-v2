import { describe, it, expect } from "vitest";
import { buildEncoderArgs, type EncoderOptions } from "./socialEncoder.js";
import type { SceneKind } from "./socialScenes.js";

const FAKE_SCENES = {
  starting_soon: Buffer.from("a"),
  live: Buffer.from("b"),
  brb: Buffer.from("c"),
  ended: Buffer.from("d"),
} satisfies Record<SceneKind, Buffer>;

const BASE: EncoderOptions = {
  broadcastId: "b-1",
  sourceUrl: "https://boiaro.com/radio-stream/live.mp3",
  scenes: FAKE_SCENES,
  initialScene: "live",
  destinations: [],
  videoBitrateKbps: 4500,
  audioBitrateKbps: 128,
  framerate: 30,
  keyframeSeconds: 2,
  preset: "veryfast",
  resolution: "1920x1080",
  threads: 2,
  sceneFps: 2,
  sourceReconnectMaxSeconds: 120,
};

/**
 * This function decides what a process on the broadcast host is actually
 * told to do, so it is asserted against directly rather than only through a
 * spawned process.
 */
describe("encoder arguments", () => {
  it("passes every value as its own array element, never a concatenated string", () => {
    const args = buildEncoderArgs({ ...BASE, dryRun: true });
    // If anything were being concatenated shell-style, a value would arrive
    // glued to its flag.
    expect(args).toContain("-i");
    expect(args).toContain(BASE.sourceUrl);
    expect(args).toContain("image2pipe");
    for (const arg of args) {
      expect(typeof arg).toBe("string");
      expect(arg).not.toMatch(/[;&|`$]/);
    }
  });

  it("reads the source URL as given, so nothing is hard-coded", () => {
    const custom = "https://example.test/radio-stream/other.mp3";
    const args = buildEncoderArgs({ ...BASE, sourceUrl: custom, dryRun: true });
    expect(args[args.lastIndexOf("-i") + 1]).toBe(custom);
  });

  it("publishes nowhere on a dry run", () => {
    const args = buildEncoderArgs({ ...BASE, dryRun: true });
    expect(args.slice(-3)).toEqual(["-f", "null", "-"]);
    expect(args.join(" ")).not.toContain("rtmp");
  });

  it("writes straight to the platform when there is one destination", () => {
    const url = "rtmps://a.rtmps.youtube.com:443/live2/abcd-1234";
    const args = buildEncoderArgs({ ...BASE, destinations: [{ destinationId: "d1", url }] });
    expect(args.slice(-2)).toEqual(["flv", url]);
    expect(args).not.toContain("tee");
  });

  it("encodes once and fans out when there are two destinations", () => {
    const yt = "rtmps://a.rtmps.youtube.com:443/live2/yt-key";
    const fb = "rtmps://live-api-s.facebook.com:443/rtmp/fb-key";
    const args = buildEncoderArgs({
      ...BASE,
      destinations: [
        { destinationId: "d1", url: yt },
        { destinationId: "d2", url: fb },
      ],
    });
    expect(args).toContain("tee");
    const spec = args[args.length - 1];
    // onfail=ignore on each output is what keeps one platform failing from
    // taking the other down with it.
    expect(spec).toBe(`[f=flv:onfail=ignore]${yt}|[f=flv:onfail=ignore]${fb}`);
    // One video encoder, not two — this is where the measured CPU saving lives.
    expect(args.filter((a) => a === "libx264")).toHaveLength(1);
  });

  it("maps the streams explicitly, which the tee muxer requires", () => {
    // Without -map, ffmpeg's default selection produces a working single
    // output but hands tee no streams at all — it dies with "Output file
    // does not contain any stream". Found by publishing to two real RTMP
    // sinks; a dry run to -f null could never have surfaced it.
    for (const destinations of [
      [],
      [{ destinationId: "d1", url: "rtmp://a.example/live/k1" }],
      [
        { destinationId: "d1", url: "rtmp://a.example/live/k1" },
        { destinationId: "d2", url: "rtmp://b.example/live/k2" },
      ],
    ]) {
      const args = buildEncoderArgs({ ...BASE, destinations, dryRun: destinations.length === 0 });
      const maps = args.reduce<string[]>((acc, a, i) => (a === "-map" ? [...acc, args[i + 1]] : acc), []);
      expect(maps, `${destinations.length} destination(s)`).toEqual(["0:v:0", "1:a:0"]);
    }
  });

  it("derives the keyframe interval from framerate and keyframe seconds", () => {
    const args = buildEncoderArgs({ ...BASE, framerate: 30, keyframeSeconds: 2, dryRun: true });
    expect(args[args.indexOf("-g") + 1]).toBe("60");
    expect(args[args.indexOf("-keyint_min") + 1]).toBe("60");

    const args25 = buildEncoderArgs({ ...BASE, framerate: 25, keyframeSeconds: 2, dryRun: true });
    expect(args25[args25.indexOf("-g") + 1]).toBe("50");
  });

  it("honours the configured bitrate and resolution rather than a fixed one", () => {
    const args = buildEncoderArgs({
      ...BASE,
      videoBitrateKbps: 6000,
      audioBitrateKbps: 160,
      resolution: "1280x720",
      dryRun: true,
    });
    expect(args[args.indexOf("-b:v") + 1]).toBe("6000k");
    expect(args[args.indexOf("-bufsize") + 1]).toBe("12000k");
    expect(args[args.indexOf("-b:a") + 1]).toBe("160k");
    expect(args[args.indexOf("-s") + 1]).toBe("1280x720");
  });

  it("caps encoder threads so a non-realtime source cannot eat the host", () => {
    // A stream_url pointing at a plain file instead of a live mount makes
    // ffmpeg encode as fast as it can — measured at ~690% CPU locally.
    const args = buildEncoderArgs({ ...BASE, threads: 2, dryRun: true });
    expect(args[args.indexOf("-threads") + 1]).toBe("2");
    // Position matters as much as presence: before the inputs, ffmpeg reads
    // -threads as a decoder option and the encoder stays uncapped. This
    // assertion exists because that exact mistake was made and measured.
    const lastInput = args.lastIndexOf("-i");
    expect(args.indexOf("-threads")).toBeGreaterThan(lastInput);
    expect(args.indexOf("-threads")).toBeLessThan(args.indexOf("libx264"));
    expect(buildEncoderArgs({ ...BASE, threads: 0, dryRun: true })[
      buildEncoderArgs({ ...BASE, threads: 0, dryRun: true }).indexOf("-threads") + 1
    ]).toBe("1");
  });

  it("takes video from a frame pipe, which is what makes a live scene change possible", () => {
    // Verified empirically: an image passed with -loop 1 is decoded once, so
    // overwriting the file changes nothing. Streaming PNG frames is what lets
    // the scene switch to "be right back" without dropping the RTMP output.
    const args = buildEncoderArgs({ ...BASE, dryRun: true });
    expect(args[args.indexOf("-f") + 1]).toBe("image2pipe");
    expect(args).toContain("pipe:0");
    expect(args).not.toContain("-loop");
  });

  it("tells ffmpeg to retry the audio source rather than exit", () => {
    // §14: a few seconds of lost audio must not stop the broadcast.
    const args = buildEncoderArgs({ ...BASE, sourceReconnectMaxSeconds: 90, dryRun: true });
    expect(args[args.indexOf("-reconnect") + 1]).toBe("1");
    expect(args[args.indexOf("-reconnect_streamed") + 1]).toBe("1");
    expect(args[args.indexOf("-reconnect_delay_max") + 1]).toBe("90");
    // The reconnect options must precede the input they apply to.
    expect(args.indexOf("-reconnect")).toBeLessThan(args.lastIndexOf("-i"));
  });

  it("does not re-pace an already-realtime source", () => {
    // -re on a live Icecast source paces it a second time and causes drift.
    expect(buildEncoderArgs({ ...BASE, dryRun: true })).not.toContain("-re");
  });
});
