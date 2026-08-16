import { useCallback, useEffect, useRef, useState } from "react";
import { Track, type Room } from "livekit-client";

/**
 * Publishes a call-in caller's WebRTC audio (see useCallInAudio/CallInPanel)
 * as a second LiveKit track — same "extra track, never touching the mic"
 * approach as useStudioMixer — so Egress actually composites the caller
 * into what listeners hear and into the master recording. Without this, an
 * on-air caller was only ever audible on a private RJ<->caller preview
 * channel that never reached the broadcast.
 */
export function useCallInBridge(getRoom: () => Room | null) {
  const publishedTrackRef = useRef<MediaStreamTrack | null>(null);
  const [isPublished, setIsPublished] = useState(false);

  const setCallerStream = useCallback(async (stream: MediaStream | null) => {
    const room = getRoom();
    if (!room) return;
    const nextTrack = stream?.getAudioTracks()[0] ?? null;
    if (nextTrack === publishedTrackRef.current) return; // already publishing this exact track — avoid unpublish/republish churn
    if (publishedTrackRef.current) {
      // stopOnUnpublish defaults to true in livekit-client, which calls
      // track.stop() on the raw MediaStreamTrack — this track is *shared*
      // with useCallInAudio's remoteStream (same object feeds the RJ's own
      // <audio> preview element and the caller's connection). Letting
      // LiveKit stop it here permanently kills the caller's audio for
      // everyone, not just this room — that track's lifecycle belongs to
      // the WebRTC peer connection/hangup, not to this bridge. Reproduced
      // in production: a caller went silent for the RJ, listeners, and any
      // future republish attempt within seconds of going on-air.
      await room.localParticipant.unpublishTrack(publishedTrackRef.current, false).catch(() => null);
      publishedTrackRef.current = null;
      setIsPublished(false);
    }
    if (nextTrack) {
      await room.localParticipant.publishTrack(nextTrack, { name: "callin-caller", source: Track.Source.Unknown });
      publishedTrackRef.current = nextTrack;
      setIsPublished(true);
    }
  }, [getRoom]);

  useEffect(() => () => {
    const room = getRoom();
    if (room && publishedTrackRef.current) {
      room.localParticipant.unpublishTrack(publishedTrackRef.current, false).catch(() => null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { setCallerStream, isPublished };
}
