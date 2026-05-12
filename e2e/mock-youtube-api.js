// Mock YouTube IFrame API injected before page loads.
// Stubs: YT.Player constructor, loadVideoById, getPlayerState.
// Fires onReady after a short delay to simulate the real API.
// Exposes window.__mockYtPlayer for test control.

window.YT = {
  Player: class {
    static State = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 };

    _videoId = "";
    _opts;
    _element;

    constructor(element, opts) {
      this._opts = opts;
      this._element = element;

      // Create a mock iframe so Playwright can inspect it
      const iframe = document.createElement("iframe");
      iframe.id = "mock-yt-player";
      iframe.dataset.videoId = "";
      element.parentNode.replaceChild(iframe, element);

      // Expose player globally for tests
      window.__mockYtPlayer = this;

      // Fire onReady after a microtask
      setTimeout(() => {
        if (opts.events?.onReady) opts.events.onReady({ target: this });
      }, 50);
    }

    loadVideoById(videoId, startSeconds) {
      this._videoId = videoId;
      const iframe = document.getElementById("mock-yt-player");
      if (iframe) {
        iframe.dataset.videoId = videoId;
        iframe.dataset.startSeconds = String(startSeconds || 0);
      }
      // Simulate playing after a tick
      setTimeout(() => {
        if (this._opts.events?.onStateChange) {
          this._opts.events.onStateChange({
            target: this,
            data: window.YT.Player.State.PLAYING,
          });
        }
      }, 50);
    }

    getPlayerState() {
      return this._videoId
        ? window.YT.Player.State.PLAYING
        : window.YT.Player.State.PAUSED;
    }

    stopVideo() {
      this._videoId = "";
      const iframe = document.getElementById("mock-yt-player");
      if (iframe) {
        iframe.dataset.videoId = "";
      }
    }

    /** Simulate the video ending (called from tests via page.evaluate) */
    simulateEnd() {
      if (this._opts.events?.onStateChange) {
        this._opts.events.onStateChange({
          target: this,
          data: window.YT.Player.State.ENDED,
        });
      }
    }
  },
  PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 },
};

// Fire the global callback if app.js is waiting for it
if (typeof window.onYouTubeIframeAPIReady === "function") {
  window.onYouTubeIframeAPIReady();
}
