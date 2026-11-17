

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface UseSpeechRecognitionOptions {
  lang?: string;
}

export interface UseSpeechRecognitionResult {
  supported: boolean;
  listening: boolean;
  transcript: string;

  interimTranscript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> & {
    length: number;
  };
  resultIndex: number;
}

interface SpeechRecognitionErrorEventLike {
  error?: string;
  message?: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;


function overlapLength(finalText: string, interimText: string): number {
  const a = finalText.trim();
  const b = interimText.trim();
  if (!a || !b) return 0;

  const max = Math.min(a.length, b.length);
  for (let len = max; len > 0; len -= 1) {
    if (a.slice(a.length - len) === b.slice(0, len)) return len;
  }
  return 0;
}

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {},
): UseSpeechRecognitionResult {
  const { lang = 'en-US' } = options;


  const Ctor = useMemo(
    () => (typeof window !== 'undefined' ? getRecognitionCtor() : null),
    [],
  );
  const supported = useMemo(
    () =>
      typeof window !== 'undefined' &&
      !!Ctor &&
      'speechSynthesis' in window,
    [Ctor],
  );

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);



  useEffect(() => {
    if (!Ctor || !supported) return undefined;
    const r = new Ctor();
    r.lang = lang;
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onresult = (event) => {
      let finalChunk = '';
      let interimChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finalChunk += text;
        } else {
          interimChunk += text;
        }
      }




















      const overlap = overlapLength(finalChunk, interimChunk);
      const interimTail = interimChunk.slice(overlap).trim();

      if (finalChunk) {
        setTranscript((prev) => (prev ? `${prev} ${finalChunk}`.trim() : finalChunk));
      }
      setInterimTranscript(interimTail);
    };

    r.onerror = (event) => {
      setError(event.error || 'speech_recognition_error');
      setListening(false);
    };

    r.onend = () => {
      setListening(false);
    };

    r.onstart = () => {
      setError(null);
      setListening(true);
    };

    recognitionRef.current = r;
    return () => {

      const instance = recognitionRef.current ?? r;
      try {
        instance.abort();
      } catch {

      }
      recognitionRef.current = null;
    };
  }, [Ctor, supported, lang]);

  const start = useCallback(() => {
    if (!recognitionRef.current || listening) return;
    setError(null);
    setInterimTranscript('');
    try {
      recognitionRef.current.start();
    } catch (e) {

      setError(e instanceof Error ? e.message : 'speech_start_failed');
      setListening(false);
    }
  }, [listening]);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {

    }
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, []);

  return {
    supported,
    listening,
    transcript,
    interimTranscript,
    error,
    start,
    stop,
    reset,
  };
}


export function browserSupportsVoice(): boolean {
  if (typeof window === 'undefined') return false;
  const hasRecognition = !!getRecognitionCtor();
  const hasSynthesis = 'speechSynthesis' in window;
  return hasRecognition && hasSynthesis;
}