/** Soft brass chord — quiet enough for launch, not attention-grabbing. */
const OPEN_VOLUME = 0.22;

let playedThisSession = false;

/**
 * Plays a short premium open chime once per cold start.
 * Respects the silent switch. Missing native audio (old dev client) is ignored.
 */
export async function playOpenChime(): Promise<void> {
  if (playedThisSession) return;
  playedThisSession = true;

  try {
    // Dynamic import so a missing native module never crashes app boot.
    const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');

    await setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: 'duckOthers',
      shouldPlayInBackground: false,
    });

    const player = createAudioPlayer(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../../assets/sounds/open-chime.wav'),
    );
    player.volume = OPEN_VOLUME;
    player.play();

    // One-shot: release after the short chime finishes.
    setTimeout(() => {
      try {
        player.release();
      } catch {
        // ignore
      }
    }, 1800);
  } catch {
    // Audio is optional polish — old preview/dev builds without expo-audio stay usable.
  }
}
