import { useCallback, useEffect, useRef } from "react"
import { trpc } from "@/lib/trpc"
import { useAudioPlayer } from "@/contexts/AudioPlayerContext"
import { useAuth } from "@/contexts/AuthContext"
import { toMediaUrl } from "@/lib/mediaUrl"
import type { MasterBook, AudiobookFormat } from "@/lib/types"

export interface OnAirShow {
  id: string
  title: string
  episode_title: string | null
  description: string | null
  cover_image_url: string | null
  audio_url: string | null
  duration_seconds: number | null
  recorded_at: string
  published_at: string | null
  visibility: string
  rj_user_id: string
  rj_stage_name: string | null
  rj_avatar_url: string | null
  station: { id: string; name: string; artwork_url: string | null } | null
  resume_position_seconds?: number
  locked?: boolean
}

/** Player id namespace, so a recorded show never collides with a book or a live stream. */
export const showTrackId = (id: string) => `onair-show-${id}`

const emptyAuthor = (name: string) => ({ id: "", name, nameEn: "", avatar: "", bio: "", genre: "", booksCount: 0, followers: "0", isFeatured: false })
const emptyNarrator = (name: string) => ({ id: "", name, nameEn: "", avatar: "", bio: "", specialty: "", audiobooksCount: 0, listeners: "0", totalListens: "0", rating: 0, isFeatured: false })

/**
 * Plays a published On Air show through the app's existing audio player
 * (requirement 7 — reuse rather than build a second one), which already gives
 * background playback, lock-screen controls, seek and duration for free.
 *
 * On top of that it records the play, resumes from the listener's saved
 * position, and persists that position every 15s while playing.
 */
export function useOnAirShowPlayer() {
  const { book, isPlaying, currentTime, duration, togglePlay, loadBook, seekTo, setHasFullAccess, setAccessLoading } = useAudioPlayer()
  const { user } = useAuth()
  const recordPlay = trpc.rj.onAir.recordShowPlay.useMutation()
  const saveProgress = trpc.rj.onAir.saveShowProgress.useMutation()
  const utils = trpc.useUtils()
  const lastSavedRef = useRef(0)

  const activeShowId = book?.id?.startsWith("onair-show-") ? book.id.replace("onair-show-", "") : null

  // The save intervals below are created once per play session; these refs keep
  // them reading live values rather than the ones captured at creation.
  const currentTimeRef = useRef(0)
  const durationRef = useRef(0)
  const userRef = useRef(user)
  currentTimeRef.current = currentTime ?? 0
  durationRef.current = duration ?? 0
  userRef.current = user

  // Persist playback position for whichever show is active, so tapping it
  // again later continues from where the listener stopped.
  useEffect(() => {
    // saveShowProgress is a protected procedure — an anonymous listener would
    // just collect a 401 every 15 seconds for the whole show.
    if (!activeShowId || !isPlaying || !user) return
    const timer = setInterval(() => {
      const position = Math.floor(currentTimeRef.current)
      if (position <= 0 || position === lastSavedRef.current) return
      lastSavedRef.current = position
      saveProgress.mutate({
        episodeId: activeShowId,
        positionSeconds: position,
        durationSeconds: durationRef.current ? Math.floor(durationRef.current) : undefined,
      })
    }, 15_000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeShowId, isPlaying, user])

  // Flush the final position when playback stops or the page unmounts —
  // without this, up to 15 seconds of listening is lost on every pause.
  useEffect(() => {
    return () => {
      if (!activeShowId || !userRef.current) return
      const position = Math.floor(currentTimeRef.current)
      if (position > 5 && position !== lastSavedRef.current) {
        saveProgress.mutate({
          episodeId: activeShowId,
          positionSeconds: position,
          durationSeconds: durationRef.current ? Math.floor(durationRef.current) : undefined,
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeShowId])

  const play = useCallback(async (show: OnAirShow) => {
    if (!show.audio_url) return
    const trackId = showTrackId(show.id)
    if (book?.id === trackId) {
      togglePlay()
      return
    }
    lastSavedRef.current = 0

    // Ask the server where this listener left off (and count the play). Falls
    // back to whatever the list payload carried if the call fails offline.
    const played = await recordPlay.mutateAsync({ episodeId: show.id }).catch(() => null)
    const resumeAt = played?.resume_position_seconds ?? show.resume_position_seconds ?? 0

    const displayTitle = show.episode_title ? `${show.title} — ${show.episode_title}` : show.title
    const cover = toMediaUrl(show.cover_image_url) || show.station?.artwork_url || "/placeholder.svg"
    const narrator = emptyNarrator(show.rj_stage_name || "RJ")

    const masterBook: MasterBook = {
      id: trackId,
      title: displayTitle,
      titleEn: "", slug: trackId,
      cover,
      description: show.description || `${show.rj_stage_name || "RJ"}${show.station?.name ? ` · ${show.station.name}` : ""}`,
      descriptionBn: "", language: "bn",
      isFeatured: false, isBestseller: false, isNew: false, isFree: true,
      rating: 0, reviewsCount: 0, totalReads: "0", publishedDate: "", tags: [],
      author: emptyAuthor(show.rj_stage_name || "RJ"),
      translator: emptyAuthor(""),
      totalListens: "0",
      category: { id: "", name: "On Air", nameBn: "অন এয়ার", icon: "", count: "0", color: "" },
      publisher: { id: "", name: "", nameEn: "", logo: "", description: "", booksCount: 0, isVerified: false },
      formats: { audiobook: { available: true, price: 0, duration: "", narrator, chapters: 1, quality: "standard" } },
    }
    const audiobook: AudiobookFormat = { available: true, price: 0, duration: "", narrator, chapters: 1, quality: "standard" }
    const track = {
      id: show.id,
      trackNumber: 1,
      title: displayTitle,
      duration: "",
      audioUrl: toMediaUrl(show.audio_url),
      isPreview: false,
      isActive: true,
    }

    loadBook(masterBook, audiobook, [track])
    // loadBook resets the player into "paywalled audiobook, access unknown"
    // (hasFullAccess=false, a 5-minute preview limit). Nothing resolves that
    // for a radio show, and seekTo is the one enforcement site that doesn't
    // wait for accessLoading — so resuming past 5:00 would pop a coin-unlock
    // modal over a free show. The server has already decided this listener may
    // hear it, so say so.
    setHasFullAccess(true)
    setAccessLoading(false)
    setTimeout(() => {
      togglePlay()
      // Skip trivial resumes near the very start — jumping to 0:03 feels broken.
      if (resumeAt > 5) seekTo(resumeAt)
    }, 300)
    utils.rj.onAir.myShowHistory.invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, togglePlay, loadBook, seekTo, setHasFullAccess, setAccessLoading])

  return {
    play,
    activeShowId,
    isPlaying,
    isShowPlaying: (id: string) => activeShowId === id && isPlaying,
  }
}
