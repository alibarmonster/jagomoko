"use client";

/** The sound a tip alert makes on stream (public/sounds), cut to its first three seconds. */
export const TIP_SOUND_SRC = "/sounds/tip-alert.mp3";
export const TIP_SOUND_MS = 3000;

/**
 * One reusable player for the overlay. A new tip restarts the sound; it always stops after
 * TIP_SOUND_MS. OBS plays it (its browser source allows sound without a click); a normal browser
 * tab may block it until someone clicks the page, and that failure is silent.
 */
export function tipSound(): { play: () => void; dispose: () => void } {
  const audio = new Audio(TIP_SOUND_SRC);
  audio.preload = "auto";
  audio.volume = 0.8;
  let stop: number | undefined;
  return {
    play() {
      window.clearTimeout(stop);
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
      stop = window.setTimeout(() => {
        audio.pause();
        audio.currentTime = 0;
      }, TIP_SOUND_MS);
    },
    dispose() {
      window.clearTimeout(stop);
      audio.pause();
    },
  };
}
