import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
      isFinal: boolean;
    };
    length: number;
  };
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: unknown) => void;
  onend: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

/**
 * The vendor-prefixed constructor, when this browser has one.
 *
 * `SpeechRecognition` is not in lib.dom, so reaching it needs a cast. Typing
 * the cast as the constructor (rather than `any`) keeps `new` checked and lets
 * the instance flow into `SpeechRecognitionInstance` without a second cast —
 * and gives both call sites one shape instead of two hand-written ones.
 */
function speechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function useSpeechRecognition({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    setIsSupported(Boolean(speechRecognitionCtor()));
  }, []);

  const toggleListening = useCallback(() => {
    const SpeechRecognition = speechRecognitionCtor();
    if (!SpeechRecognition) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = navigator.language || 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item?.isFinal && item[0]) {
            finalTranscript += item[0].transcript;
          }
        }
        if (finalTranscript.trim()) {
          onTranscript(finalTranscript.trim());
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  }, [isListening, onTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.abort?.();
    recognitionRef.current?.stop?.();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  return {
    isListening,
    isSupported,
    toggleListening,
    stopListening,
  };
}
