/**
 * Phát PCM streaming ra loa (Gemini trả về PCM 24kHz, 16-bit, mono).
 * Xếp hàng từng chunk và phát nối tiếp liền mạch.
 */
export class StreamPlayer {
  private ctx: AudioContext;
  private nextTime = 0;

  constructor(private sampleRate = 24000) {
    this.ctx = new AudioContext({ sampleRate });
  }

  /** Nhận 1 chunk PCM (base64) từ server và đưa vào hàng phát. */
  enqueueBase64(b64: string): void {
    if (this.ctx.state === "suspended") void this.ctx.resume(); // iOS
    const bytes = base64ToBytes(b64);
    const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    const float = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float[i] = int16[i] / 0x8000;

    const buffer = this.ctx.createBuffer(1, float.length, this.sampleRate);
    buffer.getChannelData(0).set(float);

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx.destination);

    const now = this.ctx.currentTime;
    if (this.nextTime < now) this.nextTime = now;
    src.start(this.nextTime);
    this.nextTime += buffer.duration;
  }

  /** Đang còn audio xếp lịch phát (dùng để tạm ngắt thu mic -> chống vọng âm). */
  isPlaying(): boolean {
    return this.nextTime > this.ctx.currentTime + 0.05;
  }

  /** Huỷ mọi audio đang chờ phát (khi người dùng nói chen ngang). */
  flush(): void {
    this.nextTime = this.ctx.currentTime;
  }

  async close(): Promise<void> {
    await this.ctx.close();
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
