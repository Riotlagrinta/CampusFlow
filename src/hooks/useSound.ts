'use client';

import { useCallback } from 'react';

const SOUNDS = {
  xp: '',
  success: '',
  send: '',
};

export function useSound() {
  // Référence stable : les composants peuvent la mettre en dépendance d'un effet sans le relancer.
  const play = useCallback((soundName: keyof typeof SOUNDS) => {
    if (typeof window === 'undefined' || !window.Audio) return;

    const soundPath = SOUNDS[soundName];
    if (!soundPath) return;

    try {
      const audio = new Audio(soundPath);
      audio.volume = 0.4;
      const playPromise = audio.play();

      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn("Audio playback prevented or failed:", error);
        });
      }
    } catch (error) {
      console.warn("Audio initialization failed:", error);
    }
  }, []);

  return { play };
}
