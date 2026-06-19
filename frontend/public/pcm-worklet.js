// AudioWorklet: nhận audio float32 từ mic, RESAMPLE về đúng 16kHz,
// rồi chuyển sang PCM 16-bit little-endian gửi về main thread.
//
// Vì sao phải resample ở đây: iOS Safari thường bỏ qua yêu cầu
// AudioContext({sampleRate:16000}) và chạy ở 48kHz. Biến toàn cục
// `sampleRate` trong scope worklet là tốc độ THẬT của context, nên
// ta dùng nó để hạ về 16kHz bằng nội suy tuyến tính.
const TARGET_RATE = 16000;

class PCMWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ratio = sampleRate / TARGET_RATE; // bước đọc khi resample
    this._pos = 0; // vị trí đọc (có phần lẻ) trong _tail
    this._tail = []; // mẫu đầu vào còn dư giữa các lần process
    this._out = []; // mẫu đã resample, chờ gom đủ block
    this._block = 1600; // ~100ms ở 16kHz
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;

    for (let i = 0; i < ch.length; i++) this._tail.push(ch[i]);

    // Nội suy tuyến tính từ sampleRate -> 16kHz.
    while (this._pos + 1 < this._tail.length) {
      const idx = Math.floor(this._pos);
      const frac = this._pos - idx;
      this._out.push(this._tail[idx] * (1 - frac) + this._tail[idx + 1] * frac);
      this._pos += this._ratio;
    }

    // Bỏ phần đã tiêu thụ, giữ lại phần dư cho lần sau.
    const consumed = Math.floor(this._pos);
    if (consumed > 0) {
      this._tail.splice(0, consumed);
      this._pos -= consumed;
    }

    // Gửi từng block PCM 16-bit.
    while (this._out.length >= this._block) {
      const chunk = this._out.splice(0, this._block);
      const pcm = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm-worklet", PCMWorklet);
