/**
 * NineCube.Digital - Provider-Independent Speech Abstractions (Architecture v3.1)
 * Decouples conversational engine from browser-specific or cloud-specific STT/TTS engines.
 */

export interface SpeechRecognitionResult {
  transcript: string;
  confidence: number; // [0.0, 1.0]
  isFinal: boolean;
  detectedLanguage?: string;
}

export interface SpeechRecognitionProvider {
  readonly id: string;
  readonly isAvailable: boolean;
  start(
    onResult: (result: SpeechRecognitionResult) => void,
    onError: (error: Error) => void
  ): Promise<void>;
  stop(): Promise<void>;
  abort(): void;
}

export interface SpeechSynthesisOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  voiceName?: string;
  language?: string;
}

export interface SpeechSynthesisProvider {
  readonly id: string;
  readonly isAvailable: boolean;
  speak(text: string, options?: SpeechSynthesisOptions): Promise<void>;
  cancel(): void;
  pause(): void;
  resume(): void;
}

/**
 * Browser-native Web Speech API implementation of SpeechRecognitionProvider.
 * Note: Browser-native STT is not guaranteed to be local or private; Chromium routes audio to cloud servers.
 */
export class BrowserSpeechRecognitionProvider implements SpeechRecognitionProvider {
  public readonly id = 'browser-native-stt';
  private recognition: any = null;

  public get isAvailable(): boolean {
    return typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
  }

  public async start(
    onResult: (result: SpeechRecognitionResult) => void,
    onError: (error: Error) => void
  ): Promise<void> {
    if (!this.isAvailable) {
      onError(new Error('Speech recognition is not supported in this client environment.'));
      return;
    }

    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SpeechRecognitionClass();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;

    this.recognition.onresult = (event: any) => {
      const lastResult = event.results[event.results.length - 1];
      if (lastResult) {
        onResult({
          transcript: lastResult[0].transcript,
          confidence: lastResult[0].confidence || 0.85,
          isFinal: lastResult.isFinal,
        });
      }
    };

    this.recognition.onerror = (event: any) => {
      onError(new Error(event.error || 'Speech recognition encountered an unknown error.'));
    };

    try {
      this.recognition.start();
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  public async stop(): Promise<void> {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Safe no-op
      }
    }
  }

  public abort(): void {
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // Safe no-op
      }
    }
  }
}

/**
 * Browser-native SpeechSynthesis implementation.
 */
export class BrowserSpeechSynthesisProvider implements SpeechSynthesisProvider {
  public readonly id = 'browser-native-tts';

  public get isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  public async speak(text: string, options?: SpeechSynthesisOptions): Promise<void> {
    if (!this.isAvailable || !text) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (options?.rate) utterance.rate = options.rate;
    if (options?.pitch) utterance.pitch = options.pitch;
    if (options?.volume) utterance.volume = options.volume;
    if (options?.language) utterance.lang = options.language;

    window.speechSynthesis.speak(utterance);
  }

  public cancel(): void {
    if (this.isAvailable) {
      window.speechSynthesis.cancel();
    }
  }

  public pause(): void {
    if (this.isAvailable) {
      window.speechSynthesis.pause();
    }
  }

  public resume(): void {
    if (this.isAvailable) {
      window.speechSynthesis.resume();
    }
  }
}
