import { describe, it, expect } from "vitest";
import { buildMasterBook } from "@/pages/BookDetail";

/**
 * Guards the audiobook chapter list against the shape the API actually returns.
 *
 * The catalogue no longer publishes `audio_url` — a track carries `has_audio`
 * instead, and the real URL is fetched per-play through the access-checked
 * presigned route. A filter that tested `audioUrl` directly therefore dropped
 * every track, and every audiobook rendered as "0 episodes".
 */
const track = (n: number, over: Record<string, unknown> = {}) => ({
  id: `t${n}`, track_number: n, title: `Chapter ${n}`, duration: "10:00",
  status: "active", is_preview: n === 1, media_type: "audio",
  has_audio: true, has_preview_clip: false,
  chapter_price: null, chapter_taka_price: null,
  ...over,
});

const book = (tracks: any[]) => ({
  id: "b1", title: "T", slug: "t", is_free: true,
  formats: [{
    id: "f1", format: "audiobook", price: 0, is_available: true,
    purchase_allowed: true, submission_status: "approved",
    has_file: false, audiobook_tracks: tracks, narrator: null,
  }],
});

describe("BookDetail — audiobook track list", () => {
  it("keeps tracks that carry has_audio but no audio_url (the live API shape)", () => {
    const { audioTracks } = buildMasterBook(book([track(1), track(2), track(3)]));
    expect(audioTracks).toHaveLength(3);
    expect(audioTracks.map(t => t.trackNumber)).toEqual([1, 2, 3]);
  });

  it("reports the chapter count from the surviving tracks", () => {
    const { book: master } = buildMasterBook(book([track(1), track(2)]));
    expect(master.formats.audiobook?.chapters).toBe(2);
  });

  it("still works against an older server that returns audio_url", () => {
    const legacy = [
      { ...track(1), has_audio: undefined, audio_url: "https://s3.example.com/audio/a.mp3" },
      { ...track(2), has_audio: undefined, audio_url: "https://s3.example.com/audio/b.mp3" },
    ];
    expect(buildMasterBook(book(legacy)).audioTracks).toHaveLength(2);
  });

  it("drops tracks that genuinely have no audio", () => {
    const { audioTracks } = buildMasterBook(
      book([track(1), track(2, { has_audio: false }), track(3, { has_audio: false })])
    );
    expect(audioTracks).toHaveLength(1);
    expect(audioTracks[0].trackNumber).toBe(1);
  });

  it("marks tracks as having a source so the player resolves them per-play", () => {
    const { audioTracks } = buildMasterBook(book([track(1)]));
    expect(audioTracks[0].hasSource).toBe(true);
    expect(audioTracks[0].audioUrl).toBeNull();
  });
});
