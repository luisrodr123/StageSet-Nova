// Experimental transport: callers must decode every track before creating it.
// All sources are scheduled against one AudioContext clock, including the main track.
export class SharedWavTransport {
  constructor(context, tracks, { leadTime = 0.1, rate = 1 } = {}) {
    if (!context || !Array.isArray(tracks) || !tracks.length || tracks.length > 32) throw new RangeError('São necessárias entre 1 e 32 pistas.');
    if (tracks.some(track => !track.buffer || !track.destination || !Number.isFinite(track.buffer.duration))) throw new TypeError('Todas as pistas precisam de áudio descodificado e de uma saída.');
    if (!Number.isFinite(leadTime) || leadTime < 0) throw new RangeError('Antecedência inválida.');
    this.context = context;
    this.tracks = tracks.slice();
    this.duration = Math.max(...tracks.map(track => track.buffer.duration));
    this.leadTime = leadTime;
    this.rate = this.validateRate(rate);
    this.offset = 0;
    this.startedAt = null;
    this.sources = [];
  }

  validateRate(rate) {
    if (!Number.isFinite(rate) || rate < 0.5 || rate > 2) throw new RangeError('Velocidade fora dos limites.');
    return rate;
  }

  get playing() { return this.startedAt !== null; }
  get position() {
    if (!this.playing) return this.offset;
    return Math.min(this.duration, this.offset + Math.max(0, this.context.currentTime - this.startedAt) * this.rate);
  }

  play() {
    if (this.playing || this.offset >= this.duration) return;
    const when = this.context.currentTime + this.leadTime;
    const sources = [];
    try {
      for (const track of this.tracks) {
        if (this.offset >= track.buffer.duration) continue;
        const source = this.context.createBufferSource();
        sources.push(source);
        source.buffer = track.buffer;
        source.playbackRate.value = this.rate;
        source.connect(track.destination);
        source.start(when, this.offset);
      }
    } catch (error) {
      for (const source of sources) { try { source.stop(); } catch {} try { source.disconnect(); } catch {} }
      throw error;
    }
    this.sources = sources;
    this.startedAt = when;
    const finalSource = sources.find(source => source.buffer.duration === this.duration);
    if (finalSource) finalSource.onended = () => {
      if (this.sources !== sources || !this.playing) return;
      this.stopSources();
      this.offset = this.duration;
      this.onended?.();
    };
  }

  pause() {
    if (!this.playing) return;
    const position = this.position;
    this.stopSources();
    this.offset = position;
  }

  seek(seconds) {
    if (!Number.isFinite(seconds)) throw new TypeError('Posição inválida.');
    const playing = this.playing;
    if (playing) this.stopSources();
    this.offset = Math.max(0, Math.min(this.duration, seconds));
    if (playing) this.play();
  }

  setRate(rate) {
    const next = this.validateRate(rate);
    const playing = this.playing;
    if (playing) this.pause();
    this.rate = next;
    if (playing) this.play();
  }

  stop() { this.stopSources(); this.offset = 0; }

  stopSources() {
    this.startedAt = null;
    for (const source of this.sources) { try { source.stop(); } catch {} try { source.disconnect(); } catch {} }
    this.sources = [];
  }
}
