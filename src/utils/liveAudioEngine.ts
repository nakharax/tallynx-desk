import type { LiveServerMessage, Session } from '@google/genai';
import {
  base64ToPcm16Float32,
  downsampleFloat32ToPcm16,
  encodePcm16ToWavBase64,
  pcm16ToBase64,
  stripMarkdownForSpeech,
} from './liveAudioUtils';

export type LiveDeskConnectionState =
  | 'IDLE'
  | 'CONNECTING'
  | 'LISTENING'
  | 'THINKING'
  | 'SPEAKING'
  | 'ERROR';

export interface LiveTranscriptEvent {
  role: 'user' | 'model';
  text: string;
  isFinal: boolean;
}

export interface LiveConnectCallbacks {
  token: string;
  model: string;
  apiVersion?: 'v1alpha' | 'v1beta';
  onStateChange?: (state: LiveDeskConnectionState) => void;
  onTranscript?: (ev: LiveTranscriptEvent) => void;
  onLevel?: (level: number) => void;
  onGoAway?: (timeLeft?: string) => void;
  onError?: (message: string) => void;
}

export class GeminiLiveDeskClient {
  private session: Session | null = null;
  private playbackCtx: AudioContext | null = null;
  private captureCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private activeSources = new Set<AudioBufferSourceNode>();
  private nextPlayTime = 0;
  private muted = false;
  private state: LiveDeskConnectionState = 'IDLE';
  private callbacks: LiveConnectCallbacks | null = null;
  private pendingOutputTranscript = '';
  private pendingInputTranscript = '';
  private disconnected = true;
  private connectionId = 0;

  private setState(next: LiveDeskConnectionState) {
    if (this.state === next) return;
    this.state = next;
    this.callbacks?.onStateChange?.(next);
  }

  public isConnected(): boolean {
    return this.session !== null && !this.disconnected;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public async connect(opts: LiveConnectCallbacks): Promise<void> {
    const closing = this.disconnect();
    const id = this.connectionId;
    await closing;
    if (id !== this.connectionId) return;
    this.disconnected = false;
    const active = () => id === this.connectionId && !this.disconnected;
    this.muted = false;
    this.callbacks = opts;
    this.pendingInputTranscript = '';
    this.pendingOutputTranscript = '';
    this.setState('CONNECTING');

    try {
      const genaiModule = await import('@google/genai');
      const { GoogleGenAI, Modality } = genaiModule;
      if (!active()) return;

      const ai = new GoogleGenAI({
        apiKey: opts.token,
        httpOptions: { apiVersion: opts.apiVersion ?? 'v1beta' },
      });

      const session = await ai.live.connect({
        model: opts.model,
        // The token already locks the voice, transcription and instruction fields.
        config: { responseModalities: [Modality.AUDIO] },
        callbacks: {
          onmessage: msg => { if (active()) this.handleServerMessage(msg); },
          onerror: () => {
            if (!active()) return;
            opts.onError?.('Live WebSocket error');
            void this.release('ERROR');
          },
          onclose: () => { if (active()) void this.disconnect(); },
        },
      });
      if (!active()) {
        session.close();
        return;
      }
      this.session = session;
      await this.startMicrophone(active);
      if (active()) this.setState('LISTENING');
    } catch (error) {
      if (!active()) return;
      await this.release('ERROR');
      throw error;
    }
  }

  private handleServerMessage(msg: LiveServerMessage): void {
    if (this.disconnected) return;

    if (msg.goAway) {
      this.callbacks?.onGoAway?.(msg.goAway.timeLeft);
    }

    const content = msg.serverContent;
    if (!content) return;

    if (content.interrupted) {
      this.stopAllPlayback();
      this.flushOutputTranscript(true);
      this.setState('LISTENING');
      return;
    }

    if (content.interimInputTranscription?.text) {
      this.pendingInputTranscript = content.interimInputTranscription.text;
      this.callbacks?.onTranscript?.({
        role: 'user',
        text: this.pendingInputTranscript,
        isFinal: false,
      });
    }

    const input = content.inputTranscription;
    if (input?.text) {
      if (input.finished === false) {
        this.pendingInputTranscript += input.text;
        this.callbacks?.onTranscript?.({ role: 'user', text: this.pendingInputTranscript, isFinal: false });
      } else if (input.finished === true) {
        this.pendingInputTranscript += input.text;
      } else {
        this.pendingInputTranscript = input.text;
      }
    }
    if (input?.finished === true || (input?.text && input.finished === undefined) || content.turnComplete) {
      const text = this.pendingInputTranscript.trim();
      this.pendingInputTranscript = '';
      if (text) this.callbacks?.onTranscript?.({ role: 'user', text, isFinal: true });
    }

    if (content.outputTranscription?.text) {
      this.pendingOutputTranscript += content.outputTranscription.text;
      this.callbacks?.onTranscript?.({
        role: 'model',
        text: this.pendingOutputTranscript,
        isFinal: false,
      });
    }

    if (content.modelTurn?.parts) {
      for (const part of content.modelTurn.parts) {
        if (part.inlineData?.data) {
          this.setState('SPEAKING');
          this.enqueuePcm24kAudio(part.inlineData.data);
        }
        if (part.text && !content.outputTranscription?.text) {
          this.pendingOutputTranscript += part.text;
          this.callbacks?.onTranscript?.({
            role: 'model',
            text: this.pendingOutputTranscript,
            isFinal: false,
          });
        }
      }
    }

    if (content.interactionStatus === 'IN_PROGRESS' && this.activeSources.size === 0) {
      this.setState('THINKING');
    }

    if (content.turnComplete || content.interactionStatus === 'IDLE') {
      this.flushOutputTranscript(true);
      if (this.activeSources.size === 0 && !this.disconnected) {
        this.setState('LISTENING');
      }
    }
  }

  private flushOutputTranscript(isFinal: boolean): void {
    const clean = this.pendingOutputTranscript.trim();
    if (!clean) return;
    if (isFinal) {
      this.pendingOutputTranscript = '';
    }
    this.callbacks?.onTranscript?.({
      role: 'model',
      text: clean,
      isFinal,
    });
  }

  private ensurePlaybackContext(): AudioContext {
    if (!this.playbackCtx || this.playbackCtx.state === 'closed') {
      this.playbackCtx = new AudioContext({ sampleRate: 24000 });
      this.nextPlayTime = this.playbackCtx.currentTime;
    }
    if (this.playbackCtx.state === 'suspended') {
      void this.playbackCtx.resume();
    }
    return this.playbackCtx;
  }

  private enqueuePcm24kAudio(base64: string): void {
    const float32 = base64ToPcm16Float32(base64);
    if (float32.length === 0) return;

    const ctx = this.ensurePlaybackContext();
    const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.copyToChannel(new Float32Array(float32), 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime + 0.02, this.nextPlayTime);
    this.nextPlayTime = startAt + audioBuffer.duration;
    this.activeSources.add(source);

    source.onended = () => {
      this.activeSources.delete(source);
      if (this.activeSources.size === 0 && this.state === 'SPEAKING' && !this.disconnected) {
        this.setState('LISTENING');
      }
    };

    source.start(startAt);
  }

  private stopAllPlayback(): void {
    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // ignore stopped nodes
      }
    }
    this.activeSources.clear();
    if (this.playbackCtx) {
      this.nextPlayTime = this.playbackCtx.currentTime;
    }
  }

  private async startMicrophone(active: () => boolean): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('เบราว์เซอร์ไม่รองรับการเข้าถึงไมโครโฟน');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    if (!active()) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.micStream = stream;
    const ctx = new AudioContext();
    this.captureCtx = ctx;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    if (!active()) return;
    const source = ctx.createMediaStreamSource(stream);
    this.micSource = source;
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    this.processorNode = processor;

    // Keep processor node alive silently without speaker feedback
    const silentGain = ctx.createGain();
    silentGain.gain.value = 0;

    processor.onaudioprocess = (ev) => {
      if (!active() || !this.session) return;
      const inputData = ev.inputBuffer.getChannelData(0);
      let sumSq = 0;
      for (let i = 0; i < inputData.length; i++) {
        sumSq += inputData[i] * inputData[i];
      }
      const rms = Math.min(1, Math.sqrt(sumSq / inputData.length) * 4);
      this.callbacks?.onLevel?.(this.muted ? 0 : rms);

      if (this.muted) return;
      const pcm16 = downsampleFloat32ToPcm16(inputData, ctx.sampleRate, 16000);
      if (pcm16.length === 0) return;
      this.session.sendRealtimeInput({
        audio: {
          data: pcm16ToBase64(pcm16),
          mimeType: 'audio/pcm;rate=16000',
        },
      });
    };

    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(ctx.destination);
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted && this.session && !this.disconnected) {
      try {
        this.session.sendRealtimeInput({ audioStreamEnd: true });
      } catch {
        // ignore if socket closing
      }
    }
    this.callbacks?.onLevel?.(0);
  }

  public sendText(text: string): void {
    if (!this.session || this.disconnected || !text.trim()) return;
    this.session.sendRealtimeInput({ text: text.trim() });
    this.callbacks?.onTranscript?.({
      role: 'user',
      text: text.trim(),
      isFinal: true,
    });
  }

  public sendImageFrame(jpegBase64: string): void {
    if (!this.session || this.disconnected || !jpegBase64) return;
    const clean = jpegBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    this.session.sendRealtimeInput({
      video: {
        data: clean,
        mimeType: 'image/jpeg',
      },
    });
  }

  public async captureAndSendScreenFrame(): Promise<boolean> {
    if (!navigator.mediaDevices?.getDisplayMedia || !this.session || this.disconnected) {
      return false;
    }
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
    try {
      const track = displayStream.getVideoTracks()[0];
      if (!track) return false;
      const video = document.createElement('video');
      video.muted = true;
      video.srcObject = displayStream;
      await video.play();
      await new Promise((r) => setTimeout(r, 120));

      const rawW = video.videoWidth || 1280;
      const rawH = video.videoHeight || 720;
      const scale = Math.min(1, 1280 / rawW);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(rawW * scale);
      canvas.height = Math.round(rawH * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      this.sendImageFrame(dataUrl);
      return true;
    } finally {
      displayStream.getTracks().forEach((t) => t.stop());
    }
  }

  public disconnect(): Promise<void> {
    return this.release('IDLE');
  }

  private async release(finalState: 'IDLE' | 'ERROR'): Promise<void> {
    this.connectionId++;
    this.disconnected = true;
    this.stopAllPlayback();

    if (this.session) {
      try {
        this.session.close();
      } catch {
        // ignore close errors
      }
      this.session = null;
    }

    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {
        // ignore
      }
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }

    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {
        // ignore
      }
      this.micSource = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }

    const capture = this.captureCtx;
    const playback = this.playbackCtx;
    this.captureCtx = null;
    this.playbackCtx = null;
    this.callbacks?.onLevel?.(0);
    this.setState(finalState);
    this.callbacks = null;
    await Promise.all([capture, playback].map(context =>
      context && context.state !== 'closed' ? context.close().catch(() => undefined) : undefined,
    ));
  }
}

export class VoiceWavRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Int16Array[] = [];
  private recordingId = 0;

  public async start(onLevel?: (level: number) => void): Promise<void> {
    const id = ++this.recordingId;
    this.chunks = [];
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('เบราว์เซอร์ไม่รองรับการใช้งานไมโครโฟน');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    if (id !== this.recordingId) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    this.stream = stream;
    const ctx = new AudioContext();
    this.ctx = ctx;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (id !== this.recordingId) return;
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    this.processor = processor;
    const silentGain = ctx.createGain();
    silentGain.gain.value = 0;

    processor.onaudioprocess = (ev) => {
      const floatData = ev.inputBuffer.getChannelData(0);
      let sumSq = 0;
      for (let i = 0; i < floatData.length; i++) {
        sumSq += floatData[i] * floatData[i];
      }
      onLevel?.(Math.min(1, Math.sqrt(sumSq / floatData.length) * 4));
      const pcm = downsampleFloat32ToPcm16(floatData, ctx.sampleRate, 16000);
      if (pcm.length > 0) this.chunks.push(pcm);
    };

    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(ctx.destination);
  }

  public async stop(): Promise<{ wavBase64: string; mimeType: 'audio/wav'; durationMs: number }> {
    this.recordingId++;
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    const context = this.ctx;
    const chunks = this.chunks;
    this.ctx = null;
    this.chunks = [];
    if (context && context.state !== 'closed') await context.close().catch(() => undefined);

    const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
    const merged = new Int16Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    const durationMs = Math.round((totalLen / 16000) * 1000);
    return {
      wavBase64: encodePcm16ToWavBase64(merged, 16000),
      mimeType: 'audio/wav',
      durationMs,
    };
  }
}

export interface SpeechPlaybackHandle {
  stop: () => void;
  finished: Promise<void>;
}

export async function speakTextWithFallback(params: {
  text: string;
  requestHeaders?: Record<string, string>;
  signal?: AbortSignal;
  lang?: 'th' | 'en';
  voice?: string;
  onStart?: () => void;
  onEnd?: () => void;
}): Promise<SpeechPlaybackHandle> {
  params.signal?.throwIfAborted();
  const cleanText = stripMarkdownForSpeech(params.text).slice(0, 1800);
  if (!cleanText) {
    params.onEnd?.();
    return { stop: () => {}, finished: Promise.resolve() };
  }

  if (params.requestHeaders) {
    try {
      const resp = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: params.requestHeaders,
        signal: AbortSignal.any([AbortSignal.timeout(35_000), ...(params.signal ? [params.signal] : [])]),
        redirect: 'error',
        body: JSON.stringify({ text: cleanText, voice: params.voice || 'Aoede', lang: params.lang }),
      });
      params.signal?.throwIfAborted();
      if (resp.ok) {
        const data = (await resp.json()) as {
          audioBase64?: string;
          mimeType?: string;
          fallbackClientTts?: boolean;
        };
        params.signal?.throwIfAborted();
        if (typeof data?.audioBase64 === 'string' && data.audioBase64 && !data.fallbackClientTts) {
          let mimeType = data.mimeType || 'audio/wav';
          let audioBase64 = data.audioBase64;
          if (/^audio\/(?:l16|pcm)\b/i.test(mimeType)) {
            const rate = Number(mimeType.match(/(?:^|;)\s*rate=(\d+)/i)?.[1] ?? 24_000);
            const bytes = Uint8Array.from(atob(audioBase64), char => char.charCodeAt(0));
            audioBase64 = encodePcm16ToWavBase64(new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2)), rate);
            mimeType = 'audio/wav';
          }
          const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
          let resolveDone!: () => void;
          const finished = new Promise<void>((res) => {
            resolveDone = res;
          });
          const finish = () => {
            params.signal?.removeEventListener('abort', stop);
            audio.onended = null;
            audio.onerror = null;
            params.onEnd?.();
            resolveDone();
          };
          const stop = () => { audio.pause(); finish(); };
          audio.onended = finish;
          audio.onerror = finish;
          params.signal?.addEventListener('abort', stop, { once: true });
          try {
            await audio.play();
            params.signal?.throwIfAborted();
          } catch (error) {
            params.signal?.removeEventListener('abort', stop);
            audio.onended = null;
            audio.onerror = null;
            throw error;
          }
          params.onStart?.();
          return { stop, finished };
        }
      }
    } catch {
      params.signal?.throwIfAborted();
      // Fall back to browser speech when cloud synthesis is unavailable.
    }
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(cleanText);
    const voices = window.speechSynthesis.getVoices();
    const lang = params.lang ?? 'th';
    const voice = voices.find(v => v.lang.toLowerCase() === lang || v.lang.toLowerCase().startsWith(`${lang}-`));
    if (voice) utter.voice = voice;
    utter.lang = voice?.lang ?? (lang === 'th' ? 'th-TH' : 'en-US');
    utter.rate = 1.02;

    let resolveDone!: () => void;
    const finished = new Promise<void>((res) => {
      resolveDone = res;
    });
    utter.onstart = () => params.onStart?.();
    utter.onend = () => {
      params.onEnd?.();
      resolveDone();
    };
    utter.onerror = utter.onend;
    window.speechSynthesis.speak(utter);
    return {
      stop: () => {
        window.speechSynthesis.cancel();
        params.onEnd?.();
        resolveDone();
      },
      finished,
    };
  }

  params.onEnd?.();
  return { stop: () => {}, finished: Promise.resolve() };
}
