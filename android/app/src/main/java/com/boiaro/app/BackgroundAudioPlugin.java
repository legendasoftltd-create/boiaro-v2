package com.boiaro.app;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * §14 spec: background playback + lock-screen controls + pause/resume on an
 * incoming call, driven by BackgroundAudioService. This plugin is the JS <->
 * native bridge only — the actual audio decode/output stays in the WebView's
 * <audio> element (see src/native/backgroundAudio.ts); this just keeps the
 * process alive in the background and surfaces transport controls through
 * the OS (lock screen, notification, Bluetooth, Android Auto).
 */
@CapacitorPlugin(name = "BackgroundAudio")
public class BackgroundAudioPlugin extends Plugin implements BackgroundAudioService.TransportListener {

    @Override
    public void load() {
        BackgroundAudioService.setTransportListener(this);
    }

    @PluginMethod
    public void start(PluginCall call) {
        Intent intent = new Intent(getContext(), BackgroundAudioService.class);
        intent.setAction(BackgroundAudioService.ACTION_START);
        intent.putExtra(BackgroundAudioService.EXTRA_TITLE, call.getString("title", ""));
        intent.putExtra(BackgroundAudioService.EXTRA_ARTIST, call.getString("artist", ""));
        intent.putExtra(BackgroundAudioService.EXTRA_IS_PLAYING, call.getBoolean("isPlaying", true));
        startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void updateMetadata(PluginCall call) {
        Intent intent = new Intent(getContext(), BackgroundAudioService.class);
        intent.setAction(BackgroundAudioService.ACTION_UPDATE_METADATA);
        intent.putExtra(BackgroundAudioService.EXTRA_TITLE, call.getString("title", ""));
        intent.putExtra(BackgroundAudioService.EXTRA_ARTIST, call.getString("artist", ""));
        startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void updatePlaybackState(PluginCall call) {
        Intent intent = new Intent(getContext(), BackgroundAudioService.class);
        intent.setAction(BackgroundAudioService.ACTION_UPDATE_STATE);
        intent.putExtra(BackgroundAudioService.EXTRA_IS_PLAYING, call.getBoolean("isPlaying", true));
        startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), BackgroundAudioService.class);
        intent.setAction(BackgroundAudioService.ACTION_STOP);
        startService(intent);
        call.resolve();
    }

    private void startService(Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
    }

    // ── BackgroundAudioService.TransportListener — native transport events relayed to JS ──

    @Override
    public void onPlay() {
        notifyListeners("play", new JSObject());
    }

    @Override
    public void onPause() {
        notifyListeners("pause", new JSObject());
    }

    @Override
    public void onStop() {
        notifyListeners("stop", new JSObject());
    }
}
