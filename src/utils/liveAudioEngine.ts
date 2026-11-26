import type { LiveServerMessage } from '@google/genai';
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
  voice?: string;
  enableThinking?: boolean;
  onStateChange?: (state: LiveDeskConnectionState) => void;
  onTranscript?: (ev: LiveTranscriptEvent) => void;
  onLevel?: (level: number) => void;
  onGoAway?: (timeLeft?: string) => void;
  onError?: (message: string) => void;
}

export class GeminiLiveDeskClient {
  private session: {
    sendRealtimeInput: (params: Record<string, unknown>) => void;
    close: () => void;
  } | null = null;
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
  private disconnected = false;

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
    await this.disconnect();
    this.disconnected = false;
    this.muted = false;
    this.callbacks = opts;
    this.pendingInputTranscript = '';
    this.pendingOutputTranscript = '';
    this.setState('CONNECTING');

    try {
      const genaiModule = await import('@google/genai');
      const { GoogleGenAI, Modality } = genaiModule;

      const ai = new GoogleGenAI({
        apiKey: opts.token,
        httpOptions: { apiVersion: opts.apiVersion ?? 'v1alpha' },
      });

      const liveConfig: Record<string, unknown> = {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        ...(opts.voice
          ? {
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice } },
              },
            }
          : {}),
        ...(opts.enableThinking
          ? {
              thinkingConfig: { thinkingLevel: 'low' },
            }
          : {}),
      };

      const session = await ai.live.connect({
        model: opts.model,
        config: liveConfig as never,
        callbacks: {
          onopen: () => {
            if (!this.disconnected) {
              this.setState('LISTENING');
            }
          },
          onmessage: (msg: LiveServerMessage) => {
            this.handleServerMessage(msg);
          },
          onerror: (err: unknown) => {
            const message =
              err instanceof Error
                ? err.message
                : typeof err === 'object' && err !== null && 'message' in err
                  ? String((err as { message?: unknown }).message || 'Live WebSocket error')
                  : 'การเชื่อมต่อ Live WebSocket ขัดข้อง';
            this.setState('ERROR');
            this.callbacks?.onError?.(message);
          },
          onclose: () => {
            if (!this.disconnected) {
              this.setState('IDLE');
            }
          },
        },
      });

      if (this.disconnected) {
        session.close();
        return;
      }

      this.session = session as unknown as {
        sendRealtimeInput: (params: Record<string, unknown>) => void;
        close: () => void;
      };
      await this.startMicrophone();
      this.setState('LISTENING');
    } catch (err) {
      this.setState('ERROR');
      throw err;
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

    if (content.inputTranscription?.text) {
      const finalUserText = content.inputTranscription.text.trim();
      this.pendingInputTranscript = '';
      if (finalUserText) {
        this.callbacks?.onTranscript?.({
          role: 'user',
          text: finalUserText,
          isFinal: true,
        });
      }
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

  private async startMicrophone(): Promise<void> {
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
    if (this.disconnected) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.micStream = stream;
    const ctx = new AudioContext();
    this.captureCtx = ctx;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const source = ctx.createMediaStreamSource(stream);
    this.micSource = source;
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    this.processorNode = processor;

    // Keep processor node alive silently without speaker feedback
    const silentGain = ctx.createGain();
    silentGain.gain.value = 0;

    processor.onaudioprocess = (ev) => {
      if (this.disconnected || !this.session) return;
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

  public async disconnect(): Promise<void> {
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

    if (this.captureCtx && this.captureCtx.state !== 'closed') {
      await this.captureCtx.close().catch(() => null);
      this.captureCtx = null;
    }

    if (this.playbackCtx && this.playbackCtx.state !== 'closed') {
      await this.playbackCtx.close().catch(() => null);
      this.playbackCtx = null;
    }

    this.callbacks?.onLevel?.(0);
    this.setState('IDLE');
  }
}

export class VoiceWavRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Int16Array[] = [];

  public async start(onLevel?: (level: number) => void): Promise<void> {
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
    this.stream = stream;
    const ctx = new AudioContext();
    this.ctx = ctx;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
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
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.ctx && this.ctx.state !== 'closed') {
      await this.ctx.close().catch(() => null);
      this.ctx = null;
    }

    const totalLen = this.chunks.reduce((acc, c) => acc + c.length, 0);
    const merged = new Int16Array(totalLen);
    let offset = 0;
    for (const c of this.chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    this.chunks = [];
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
  voice?: string;
  onStart?: () => void;
  onEnd?: () => void;
}): Promise<SpeechPlaybackHandle> {
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
        redirect: 'error',
        body: JSON.stringify({ text: cleanText, voice: params.voice || 'Aoede' }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as {
          audioBase64?: string;
          mimeType?: string;
          fallbackClientTts?: boolean;
        };
        if (data.audioBase64 && !data.fallbackClientTts) {
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
          audio.onended = () => {
            params.onEnd?.();
            resolveDone();
          };
          audio.onerror = () => {
            params.onEnd?.();
            resolveDone();
          };
          params.onStart?.();
          await audio.play();
          return {
            stop: () => {
              audio.pause();
              audio.currentTime = 0;
              params.onEnd?.();
              resolveDone();
            },
            finished,
          };
        }
      }
    } catch {
      // fall through cleanly to Web Speech API
    }
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(cleanText);
    const voices = window.speechSynthesis.getVoices();
    const thVoice = voices.find((v) => /^th/i.test(v.lang));
    if (thVoice) {
      utter.voice = thVoice;
      utter.lang = thVoice.lang;
    } else {
      utter.lang = 'th-TH';
    }
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
    utter.onerror = () => {
      params.onEnd?.();
      resolveDone();
    };
    params.onStart?.();
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
