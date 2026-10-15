package zero.web.media;
import java.util.ArrayList;
import elemental2.dom.DomGlobal;
import elemental2.dom.Element;
import elemental2.dom.HTMLAudioElement;
import jsinterop.base.Js;

/** Native browser audio with explicit autoplay recovery, pause, reset and cleanup. */
final class BrowserSound {
    private static final ArrayList<BrowserSound> sounds = new ArrayList<>();
    private static boolean installed;
    private static Element notice;
    final HTMLAudioElement audio = Js.uncheckedCast(DomGlobal.document.createElement("audio"));
    private final String source;
    private final Runnable onError;
    private boolean requested, blocked, disposed, playing;
    private int generation;
    Runnable onBlocked;
    BrowserSound(String source, Runnable onError) {
        this.source = source; this.onError = onError;
        audio.addEventListener("playing", event -> { if (!disposed) playing = true; });
        audio.addEventListener("pause", event -> playing = false);
        audio.addEventListener("ended", event -> playing = false);
        audio.src = source; audio.preload = "auto";
        audio.addEventListener("error", event -> failed());
        sounds.add(this);
        if (!installed) {
            installed = true;
            DomGlobal.document.addEventListener("pointerdown", event -> unlock());
            DomGlobal.document.addEventListener("keydown", event -> unlock());
            DomGlobal.window.addEventListener("blur", event -> suspend());
            DomGlobal.document.addEventListener("visibilitychange", event -> { if (DomGlobal.document.hidden) suspend(); });
            DomGlobal.window.addEventListener("pagehide", event -> {
                // Retain reusable players in the back/forward cache. Playback
                // resumes only when the app explicitly requests it again.
                if (Js.isTruthy(Js.asPropertyMap(event).get("persisted"))) { suspend(); return; }
                for (BrowserSound sound : new ArrayList<>(sounds)) sound.dispose();
            });
        }
        audio.load();
    }
    private static void suspend() {
        for (BrowserSound sound : new ArrayList<>(sounds)) sound.pause();
    }
    private static void unlock() {
        for (BrowserSound sound : new ArrayList<>(sounds)) {
            if (sound.blocked && sound.requested) sound.play();
        }
    }
    void play() {
        if (disposed) return;
        requested = true;
        final int attempt = ++generation;
        audio.play().then(value -> {
            if (attempt != generation) return null;
            if (disposed || !requested) audio.pause();
            blocked = false;
            clearNotice();
            return null;
        }, error -> {
            if (disposed || attempt != generation || !requested) return null;
            String name = String.valueOf(Js.asPropertyMap(error).get("name"));
            if (name.equals("NotAllowedError")) {
                blocked = true;
                if (onBlocked != null) onBlocked.run();
                showNotice("Click or press a key to enable sound.");
            } else if (!name.equals("AbortError")) failed();
            return null;
        });
    }
    boolean isPlaying() { return playing && !audio.paused && !audio.ended && !disposed; }
    boolean isPending() { return requested && !playing && !disposed; }
    boolean isBlocked() { return blocked && requested && !disposed; }
    boolean isDisposed() { return disposed; }
    void pause() { playing = false; requested = false; blocked = false; generation++; audio.pause(); clearNotice(); }
    void stop() { pause(); audio.currentTime = 0; }
    void dispose() {
        if (disposed) return;
        pause(); disposed = true; sounds.remove(this);
        audio.removeAttribute("src"); audio.load();
    }
    private void failed() {
        if (disposed) return;
        playing = false; requested = false; blocked = false;
        DomGlobal.console.error("Cannot play audio: " + source);
        showNotice("Audio unavailable: " + source);
        onError.run();
    }
    private static void showNotice(String text) {
        if (notice == null) {
            notice = DomGlobal.document.createElement("div");
            notice.setAttribute("role", "status");
            notice.setAttribute("style", "pointer-events:none;position:fixed;bottom:8px;left:8px;padding:8px;background:#fff;color:#222;z-index:99999;font:14px sans-serif;max-width:90vw");
            DomGlobal.document.body.appendChild(notice);
        }
        notice.textContent = text;
    }
    private static void clearNotice() {
        for (BrowserSound sound : sounds) if (sound.blocked && sound.requested) return;
        if (notice != null && notice.textContent.equals("Click or press a key to enable sound.")) {
            notice.remove(); notice = null;
        }
    }
}
