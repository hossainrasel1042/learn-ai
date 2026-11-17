

'use client';

import { useCallback, useEffect, useRef } from 'react';

export interface UseSpeechSynthesisOptions {
  rate?: number;
  lang?: string;
}

export interface UseSpeechSynthesisResult {
  supported: boolean;
  speak: (text: string, options?: UseSpeechSynthesisOptions) => void;
  cancel: () => void;
}

function isSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function useSpeechSynthesis(): UseSpeechSynthesisResult {
  const supported = isSupported();



  const synthRef = useRef<SpeechSynthesis | null>(
    typeof window !== 'undefined' && 'speechSynthesis' in window
      ? window.speechSynthesis
      : null,
  );

  useEffect(() => {
    if (!supported) return undefined;
    synthRef.current = window.speechSynthesis;



  }, [supported]);

  const cancel = useCallback(() => {
    if (!supported || !synthRef.current) return;
    try {
      synthRef.current.cancel();
    } catch {

    }
  }, [supported]);

  const speak = useCallback(
    (text: string, options: UseSpeechSynthesisOptions = {}) => {
      if (!supported || !synthRef.current || !text || !text.trim()) return;

      try {
        synthRef.current.cancel();
      } catch {

      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = options.rate ?? 1;
      utterance.lang = options.lang ?? 'en-US';
      try {
        synthRef.current.speak(utterance);
      } catch {

      }
    },
    [supported],
  );

  return { supported, speak, cancel };
}