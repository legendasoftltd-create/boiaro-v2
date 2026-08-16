import { registerPlugin, Capacitor } from "@capacitor/core"

// §14 spec: background playback + lock-screen controls + pause/resume on an
// incoming call. Backed by a real Android foreground Service + MediaSession
// (android/app/src/main/java/com/boiaro/app/BackgroundAudio{Service,Plugin}.java).
// registerPlugin's web fallback silently resolves void methods and never
// fires listeners when no native implementation exists, so every call site
// below is safe to use unconditionally without an isNativePlatform() check
// of its own.
//
// No iOS implementation: there's no ios/ Xcode project in this repo yet
// (`npx cap add ios` needs Xcode, which isn't available in this
// environment), and this JS bridge alone can't stand in for one — the
// equivalent iOS approach isn't a Swift port of the Android plugin above,
// it's AVAudioSession's .playback category (for background audio) +
// MPNowPlayingInfoCenter/MPRemoteCommandCenter (for lock-screen controls) +
// AVAudioSession.interruptionNotification (for the phone-call pause/resume
// case) — a different native surface than Android's Service/MediaSession,
// needing its own real implementation once an ios/ project exists.
export interface BackgroundAudioPlugin {
  start(options: { title: string; artist?: string; isPlaying: boolean }): Promise<void>
  updateMetadata(options: { title: string; artist?: string }): Promise<void>
  updatePlaybackState(options: { isPlaying: boolean }): Promise<void>
  stop(): Promise<void>
  addListener(eventName: "play" | "pause" | "stop", listenerFunc: () => void): Promise<{ remove: () => void }>
}

export const BackgroundAudio = registerPlugin<BackgroundAudioPlugin>("BackgroundAudio")

export const isNativeAudioSupported = Capacitor.getPlatform() === "android"
