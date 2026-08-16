package com.boiaro.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.IBinder;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import android.content.pm.ServiceInfo;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

/**
 * §14 spec: background playback + lock-screen media controls + pause/resume
 * on an incoming call. A foreground Service is required for Android to keep
 * the process (and therefore the WebView's <audio> element) alive once the
 * app is backgrounded — without one, playback is killed within seconds of
 * leaving the foreground, same as any other background work on Android.
 *
 * This service owns the MediaSession and the notification; it does NOT
 * touch audio itself (the actual decode/output stays in the WebView's
 * <audio> element via BackgroundAudioPlugin's JS bridge). Play/pause
 * requests that originate natively (lock screen, notification, Bluetooth,
 * or an incoming-call audio-focus loss) are relayed back to JS through the
 * plugin's Listener interface, which is expected to pause/resume the real
 * <audio> element and call back into updatePlaybackState() to keep this
 * service's own state in sync.
 */
public class BackgroundAudioService extends Service {
    public static final String ACTION_START = "com.boiaro.app.action.START";
    public static final String ACTION_UPDATE_METADATA = "com.boiaro.app.action.UPDATE_METADATA";
    public static final String ACTION_UPDATE_STATE = "com.boiaro.app.action.UPDATE_STATE";
    public static final String ACTION_STOP = "com.boiaro.app.action.STOP";
    // Handled directly by this service (not routed through MediaSession's
    // media-button dispatch, which needs a registered MediaButtonReceiver
    // component this app doesn't declare) — the notification's own inline
    // play/pause button targets these explicitly.
    private static final String ACTION_NOTIFICATION_PLAY = "com.boiaro.app.action.NOTIFICATION_PLAY";
    private static final String ACTION_NOTIFICATION_PAUSE = "com.boiaro.app.action.NOTIFICATION_PAUSE";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ARTIST = "artist";
    public static final String EXTRA_IS_PLAYING = "isPlaying";

    private static final String CHANNEL_ID = "boiaro_playback";
    private static final int NOTIFICATION_ID = 4171;

    /** Relayed to BackgroundAudioPlugin so it can drive the real <audio> element and notify JS. */
    public interface TransportListener {
        void onPlay();
        void onPause();
        void onStop();
    }

    private static TransportListener transportListener;

    public static void setTransportListener(TransportListener listener) {
        transportListener = listener;
    }

    private MediaSessionCompat mediaSession;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private boolean pausedByFocusLoss = false;
    private String title = "";
    private String artist = "";
    private boolean isPlaying = false;

    private final AudioManager.OnAudioFocusChangeListener focusListener = focusChange -> {
        switch (focusChange) {
            case AudioManager.AUDIOFOCUS_LOSS:
                // Permanent loss (another app took over playback) — don't auto-resume later.
                pausedByFocusLoss = false;
                if (transportListener != null) transportListener.onPause();
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                // Typically an incoming call or a short notification sound.
                if (isPlaying) {
                    pausedByFocusLoss = true;
                    if (transportListener != null) transportListener.onPause();
                }
                break;
            case AudioManager.AUDIOFOCUS_GAIN:
                if (pausedByFocusLoss) {
                    pausedByFocusLoss = false;
                    if (transportListener != null) transportListener.onPlay();
                }
                break;
        }
    };

    private final MediaSessionCompat.Callback sessionCallback = new MediaSessionCompat.Callback() {
        @Override
        public void onPlay() {
            if (transportListener != null) transportListener.onPlay();
        }

        @Override
        public void onPause() {
            if (transportListener != null) transportListener.onPause();
        }

        @Override
        public void onStop() {
            if (transportListener != null) transportListener.onStop();
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        createNotificationChannel();

        mediaSession = new MediaSessionCompat(this, "BoiaroBackgroundAudio");
        mediaSession.setCallback(sessionCallback);
        mediaSession.setFlags(
            MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
        );
        mediaSession.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        String action = intent.getAction();

        if (ACTION_START.equals(action) || ACTION_UPDATE_METADATA.equals(action)) {
            title = intent.getStringExtra(EXTRA_TITLE);
            artist = intent.getStringExtra(EXTRA_ARTIST);
            updateMetadata();
        }

        if (ACTION_START.equals(action) || ACTION_UPDATE_STATE.equals(action)) {
            isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, true);
            updatePlaybackState();
            if (isPlaying) requestAudioFocus();
            Notification notification = buildNotification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceCompat.startForeground(
                    this, NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                );
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } else if (ACTION_STOP.equals(action)) {
            abandonAudioFocus();
            stopForeground(true);
            stopSelf();
        } else if (ACTION_NOTIFICATION_PLAY.equals(action)) {
            if (transportListener != null) transportListener.onPlay();
        } else if (ACTION_NOTIFICATION_PAUSE.equals(action)) {
            if (transportListener != null) transportListener.onPause();
        }

        return START_NOT_STICKY;
    }

    private void requestAudioFocus() {
        if (audioManager == null) return;
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
            .build();
        audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(attrs)
            .setOnAudioFocusChangeListener(focusListener)
            .build();
        audioManager.requestAudioFocus(audioFocusRequest);
    }

    private void abandonAudioFocus() {
        if (audioManager != null && audioFocusRequest != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
        }
    }

    private void updateMetadata() {
        MediaMetadataCompat metadata = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title != null ? title : "")
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist != null ? artist : "")
            .build();
        mediaSession.setMetadata(metadata);
    }

    private void updatePlaybackState() {
        int state = isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
        PlaybackStateCompat playbackState = new PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE | PlaybackStateCompat.ACTION_STOP)
            .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1f)
            .build();
        mediaSession.setPlaybackState(playbackState);
    }

    private Notification buildNotification() {
        Intent toggleIntent = new Intent(this, BackgroundAudioService.class);
        toggleIntent.setAction(isPlaying ? ACTION_NOTIFICATION_PAUSE : ACTION_NOTIFICATION_PLAY);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent playPauseIntent = PendingIntent.getService(this, 0, toggleIntent, flags);
        int playPauseIcon = isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
            .setContentTitle(title != null && !title.isEmpty() ? title : "BoiAro On Air")
            .setContentText(artist != null ? artist : "")
            .setOnlyAlertOnce(true)
            .setOngoing(isPlaying)
            .addAction(playPauseIcon, isPlaying ? "Pause" : "Play", playPauseIntent)
            .setStyle(
                new MediaStyle().setMediaSession(mediaSession.getSessionToken()).setShowActionsInCompactView(0)
            );
        return builder.build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("BoiAro On Air playback controls");
            manager.createNotificationChannel(channel);
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        abandonAudioFocus();
        mediaSession.setActive(false);
        mediaSession.release();
        super.onDestroy();
    }
}
