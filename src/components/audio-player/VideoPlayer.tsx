import { useRef, useEffect, useState } from "react"
import { useAudioPlayer } from "@/contexts/AudioPlayerContext"

/**
 * Inline video element for video-type audiobook tracks.
 * Renders inside FullPlayer in place of cover art.
 *
 * The background Audio element is MUTED for video tracks (AudioPlayerContext
 * loadTrackSource). The muted audio element drives all context state
 * (currentTime, duration, progress, isPlaying). This <video> element
 * stays in sync by following those state values and plays the actual
 * audio+video to the user.
 */
export function VideoPlayer() {
  const {
    book, tracks, currentTrackIndex,
    isPlaying, currentTime, playbackRate, volume,
    seekTo, resolveTrackUrl,
  } = useAudioPlayer()

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [src, setSrc]         = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const seekingRef            = useRef(false) // prevent seek feedback loop

  const track = tracks[currentTrackIndex]

  // ── Load URL when track changes ─────────────────────────────────────────
  useEffect(() => {
    if (!track || !book) return
    let cancelled = false
    setLoading(true)
    setSrc(null)

    resolveTrackUrl(track, book.id).then((url) => {
      if (cancelled || !url) return
      setSrc(url)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [track?.id, book?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync play / pause from context state ────────────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v || !src) return
    if (isPlaying) {
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [isPlaying, src])

  // ── Sync playback rate and volume ───────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.playbackRate = playbackRate
    v.volume = volume
  }, [playbackRate, volume])

  // ── Sync seek: context currentTime → video element ──────────────────────
  // Triggered when user uses the seek bar or skip buttons.
  // Guard seekingRef so the video's own onTimeUpdate doesn't loop back.
  useEffect(() => {
    const v = videoRef.current
    if (!v || !src || seekingRef.current) return
    const delta = Math.abs(v.currentTime - currentTime)
    if (delta > 1.5) {
      seekingRef.current = true
      v.currentTime = currentTime
      setTimeout(() => { seekingRef.current = false }, 200)
    }
  }, [currentTime, src])

  // ── Sync seek: video element → context (rare — e.g. native video controls) ─
  const handleTimeUpdate = () => {
    const v = videoRef.current
    if (!v || seekingRef.current) return
    // Only push back to context if video drifted significantly from audio element
    if (Math.abs(v.currentTime - currentTime) > 2) {
      seekTo(v.currentTime)
    }
  }

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
