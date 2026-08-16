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
    if (publishedTrackRef.current) {
      await room.localParticipant.unpublishTrack(publishedTrackRef.current).catch(() => null);
      publishedTrackRef.current = null;
      setIsPublished(false);
    }
    const track = stream?.getAudioTracks()[0];
    if (track) {
      await room.localParticipant.publishTrack(track, { name: "callin-caller", source: Track.Source.Unknown });
      publishedTrackRef.current = track;
      setIsPublished(true);
    }
  }, [getRoom]);

  useEffect(() => () => {
    const room = getRoom();
    if (room && publishedTrackRef.current) {
      room.localParticipant.unpublishTrack(publishedTrackRef.current).catch(() => null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { setCallerStream, isPublished };
}
