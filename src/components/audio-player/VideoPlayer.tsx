import { useRef, useEffect, useCallback, useState } from "react"
import { useAudioPlayer } from "@/contexts/AudioPlayerContext"

/**
 * Inline video element for video-type audiobook tracks.
 * Renders inside the FullPlayer in place of the cover art.
 */
export function VideoPlayer() {
  const {
    book, tracks, currentTrackIndex, isPlaying, currentTime, playbackRate, volume,
    seekTo, resolveTrackUrl,
  } = useAudioPlayer()

  const videoRef = useRef<HTMLVideoElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const track = tracks[currentTrackIndex]

  // Resolve signed URL for the video track
  useEffect(() => {
    if (!track || !book) return
    let cancelled = false
    setLoading(true)

    resolveTrackUrl(track, book.id).then((url) => {
      if (!cancelled) {
        setSrc(url)
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [track?.id, book?.id, resolveTrackUrl])

  // Sync playback state
  useEffect(() => {
    const v = videoRef.current
    if (!v || !src) return

    if (isPlaying) {
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [isPlaying, src])

  // Sync playback rate + volume
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.playbackRate = playbackRate
    v.volume = volume
  }, [playbackRate, volume])

  // Sync seek from external controls
  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    // Only push time updates back to context if delta is large (avoid loops)
    const delta = Math.abs(v.currentTime - currentTime)
    if (delta > 1.5) {
      seekTo(v.currentTime)
    }
  }, [currentTime, seekTo])

  if (loading || !src) {
    return (
      <div className="w-full aspect-video rounded-2xl bg-secondary/30 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <video
      ref={videoRef}
      src={src}
      className="w-full max-h-[50vh] rounded-2xl bg-black shadow-2xl shadow-black/50 ring-1 ring-border/20"
      onTimeUpdate={handleTimeUpdate}
      playsInline
      preload="metadata"
    />
  )
}
