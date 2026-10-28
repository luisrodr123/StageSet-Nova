// SMPTE labels, MIDI Time Code and LTC bit frames. See docs/CONTINUAR.md.
export const RATES = [24, 25, 30000 / 1001, 30];
export function timecode(seconds, rate = 1) {
  if (!Number.isInteger(rate) || !RATES[rate]) throw new RangeError('Frame rate inválido');
  const fps = RATES[rate], nominal = Math.round(fps);
  const day = rate === 2 ? 2589408 : nominal * 86400;
  let n = ((Math.floor(Math.max(0, seconds) * fps + 1e-7) % day) + day) % day;
  if (rate === 2) {
    const blocks = Math.floor(n / 17982), rest = n % 17982;
    n += 18 * blocks + 2 * Math.max(0, Math.floor((rest - 2) / 1798));
  }
  return { hours: Math.floor(n / (nominal * 3600)) % 24, minutes: Math.floor(n / (nominal * 60)) % 60, seconds: Math.floor(n / nominal) % 60, frames: n % nominal, rate };
}
export function secondsFromTimecode(t) {
  const fps = RATES[t.rate], nominal = Math.round(fps);
  if (!fps || ![t.hours, t.minutes, t.seconds, t.frames].every(Number.isInteger) || t.hours < 0 || t.hours > 23 || t.minutes < 0 || t.minutes > 59 || t.seconds < 0 || t.seconds > 59 || t.frames < 0 || t.frames >= nominal) return null;
  if (t.rate === 2 && t.minutes % 10 && t.seconds === 0 && t.frames < 2) return null;
  let n = ((t.hours * 60 + t.minutes) * 60 + t.seconds) * nominal + t.frames;
  if (t.rate === 2) { const minutes = t.hours * 60 + t.minutes; n -= 2 * (minutes - Math.floor(minutes / 10)); }
  return n / fps;
}
export function formatTimecode(t) { return [t.hours, t.minutes, t.seconds].map(n => String(n).padStart(2, '0')).join(':') + (t.rate === 2 ? ';' : ':') + String(t.frames).padStart(2, '0'); }
export function fullFrame(t) { return [0xf0, 0x7f, 0x7f, 1, 1, (t.rate << 5) | t.hours, t.minutes, t.seconds, t.frames, 0xf7]; }
export function quarterFrame(t, part) {
  const values = [t.frames & 15, t.frames >> 4, t.seconds & 15, t.seconds >> 4, t.minutes & 15, t.minutes >> 4, t.hours & 15, (t.hours >> 4) | (t.rate << 1)];
  return [0xf1, (part << 4) | values[part]];
}
export class MtcDecoder {
  constructor() { this.reset(); }
  reset() { this.parts = []; this.last = -1; this.direction = 0; this.count = 0; }
  push(data) {
    if (data.length === 10 && data[0] === 0xf0 && data[1] === 0x7f && data[3] === 1 && data[4] === 1 && data[9] === 0xf7) {
      this.reset();
      const t = { hours: data[5] & 31, minutes: data[6], seconds: data[7], frames: data[8], rate: (data[5] >> 5) & 3 };
      const seconds = secondsFromTimecode(t);
      return seconds === null ? null : { ...t, time: seconds, running: false };
    }
    if (data.length !== 2 || data[0] !== 0xf1 || data[1] > 127) return null;
    const part = data[1] >> 4, value = data[1] & 15;
    const direction = part === (this.last + 1) % 8 ? 1 : part === (this.last + 7) % 8 ? -1 : 0;
    if (!direction || (this.direction && direction !== this.direction)) { this.count = 0; this.direction = 0; }
    this.parts[part] = value; this.count++; this.last = part;
    if (direction) this.direction = direction;
    if (this.count < 8 || (direction === 1 ? part !== 7 : part !== 0)) return null;
    this.count = 0;
    const p = this.parts, t = { frames: p[0] | p[1] << 4, seconds: p[2] | p[3] << 4, minutes: p[4] | p[5] << 4, hours: p[6] | (p[7] & 1) << 4, rate: p[7] >> 1 };
    const seconds = secondsFromTimecode(t);
    return seconds === null ? null : { ...t, time: Math.max(0, seconds + direction * 2 / RATES[t.rate]), running: true, direction };
  }
}
export function ltcBits(t) {
  const bits = new Uint8Array(80);
  const set = (at, n, count) => { for (let i = 0; i < count; i++) bits[at + i] = (n >> i) & 1; };
  for (const [at, n, count] of [[0,t.frames%10,4],[8,Math.floor(t.frames/10),2],[16,t.seconds%10,4],[24,Math.floor(t.seconds/10),3],[32,t.minutes%10,4],[40,Math.floor(t.minutes/10),3],[48,t.hours%10,4],[56,Math.floor(t.hours/10),2]]) set(at,n,count);
  bits[10] = Number(t.rate === 2);
  bits.set([0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,1],64);
  bits[t.rate === 1 ? 59 : 27] = bits.reduce((n,b) => n + b, 0) % 2;
  return bits;
}
export function decodeLtcBits(bits, rate = 1) {
  if (bits.length !== 80 || bits.slice(64).join('') !== '0011111111111101' || bits.reduce((n,b) => n+b,0) % 2) return null;
  const get = (at, count) => { let n=0; for(let i=0;i<count;i++) n |= bits[at+i]<<i; return n; };
  const units = [get(0,4),get(16,4),get(32,4),get(48,4)];
  if (units.some(n=>n>9)) return null;
  const t = { frames:units[0]+10*get(8,2), seconds:units[1]+10*get(24,3), minutes:units[2]+10*get(40,3), hours:units[3]+10*get(56,2), rate:bits[10]?2:rate };
  const time = secondsFromTimecode(t); return time === null ? null : { ...t, time, running:true };
}
// Streaming biphase-mark decoder; input never passes through to an audio output.
export class LtcDecoder {
  constructor(sampleRate, rate = 1) { this.sampleRate=sampleRate; this.rate=rate; this.half=sampleRate/(RATES[rate]*160); this.lastSign=0; this.lastEdge=0; this.position=0; this.pending=false; this.bits=[]; }
  push(samples) {
    const frames=[];
    for (const sample of samples) {
      this.position++;
      const sign = sample > .02 ? 1 : sample < -.02 ? -1 : this.lastSign;
      if (!sign || sign === this.lastSign) continue;
      const interval=this.position-this.lastEdge; this.lastEdge=this.position; this.lastSign=sign;
      if(interval < this.half*.45 || interval > this.half*2.6) { this.pending=false; this.bits=[]; continue; }
      let bit;
      if(interval < this.half*1.5) { this.half=.98*this.half+.02*interval; if(!this.pending){this.pending=true;continue;} this.pending=false; bit=1; }
      else { this.half=.98*this.half+.01*interval; if(this.pending){this.pending=false;this.bits=[];} bit=0; }
      this.bits.push(bit); if(this.bits.length>80)this.bits.shift();
      if(this.bits.length===80){const frame=decodeLtcBits(this.bits,this.rate);if(frame)frames.push(frame);}
    }
    return frames;
  }
}
