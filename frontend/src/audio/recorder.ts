/**
 * Thu âm từ micro -> PCM 16kHz/16-bit/mono.
 * Mỗi block PCM được đẩy ra qua callback onChunk (ArrayBuffer).
 */
export class MicRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  /** Callback cho mức âm lượng (0..1) để vẽ visual. */
  onLevel: ((level: number) => void) | null = null;

  async start(onChunk: (pcm: ArrayBuffer) => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // Yêu cầu 16kHz; nếu thiết bị (iOS) bỏ qua, worklet sẽ tự resample về 16kHz.
    this.ctx = new AudioContext({ sampleRate: 16000 });
    await this.ctx.resume(); // iOS: bắt buộc resume sau cử chỉ chạm
    await this.ctx.audioWorklet.addModule("/pcm-worklet.js");

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm-worklet");

    this.node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      const pcm = e.data;
      onChunk(pcm);
      if (this.onLevel) this.onLevel(rms(new Int16Array(pcm)));
    };

    this.source.connect(this.node);
    // Không nối node -> destination để tránh nghe lại tiếng mình.
  }

  async stop(): Promise<void> {
    this.node?.port.close();
    this.node?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close();
    this.ctx = null;
    this.stream = null;
    this.node = null;
    this.source = null;
  }
}

function rms(pcm: Int16Array): number {
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) {
    const v = pcm[i] / 0x8000;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / pcm.length) * 3);
}
