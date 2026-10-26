const WIDTH = 300;
const HEIGHT = 216;
const PACKET_BYTES = 24;
const PACKETS_PER_SECOND = 300;

function color(r, g, b) {
  return [((r & 0x3f) << 2) | ((r & 0x3f) >> 4), ((g & 0x3f) << 2) | ((g & 0x3f) >> 4), ((b & 0x3f) << 2) | ((b & 0x3f) >> 4), 255];
}

export class CdgDecoder {
  constructor(buffer) {
    this.bytes = new Uint8Array(buffer);
    if (!this.bytes.length || this.bytes.length % PACKET_BYTES !== 0) throw new Error("O ficheiro CD+G deve conter pacotes completos de 24 bytes.");
    this.packetCount = Math.floor(this.bytes.length / PACKET_BYTES);
    this.reset();
  }

  reset() {
    this.palette = Array.from({ length: 16 }, (_, i) => color(i * 4, i * 4, i * 4));
    this.pixels = new Uint8Array(WIDTH * HEIGHT);
    this.borderColor = 0;
    this.transparentColor = -1;
    this.scrollX = 0;
    this.scrollY = 0;
    this.packetIndex = 0;
  }

  processUntil(target) {
    const end = Math.min(this.packetCount, Math.max(0, target));
    if (end < this.packetIndex) this.reset();
    while (this.packetIndex < end) {
      const offset = this.packetIndex * PACKET_BYTES;
      const command = this.bytes[offset] & 0x3f;
      const instruction = this.bytes[offset + 1] & 0x3f;
      if (command === 0x09) this.apply(instruction, this.bytes.subarray(offset + 4, offset + 20));
      this.packetIndex += 1;
    }
  }

  apply(instruction, data) {
    switch (instruction) {
      case 1: {
        const index = data[0] & 0x0f;
        this.pixels.fill(index);
        this.borderColor = index;
        break;
      }
      case 2:
        this.borderColor = data[0] & 0x0f;
        for (let y = 0; y < HEIGHT; y++) {
          for (let x = 0; x < WIDTH; x++) {
            if (x < 6 || x >= WIDTH - 6 || y < 12 || y >= HEIGHT - 12) this.pixels[y * WIDTH + x] = this.borderColor;
          }
        }
        break;
      case 6:
      case 38:
        this.tile(data, instruction === 38);
        break;
      case 20:
      case 24:
        this.scroll(data, instruction === 24);
        break;
      case 28:
        this.transparentColor = data[0] & 0x0f;
        break;
      case 30:
      case 31:
        this.loadPalette(data, instruction === 31 ? 8 : 0);
        break;
      default:
        break;
    }
  }

  loadPalette(data, start) {
    for (let i = 0; i < 8; i++) {
      const a = data[i * 2] & 0x3f;
      const b = data[i * 2 + 1] & 0x3f;
      const red = (a >> 2) & 0x0f;
      const green = ((a & 0x03) << 2) | ((b >> 4) & 0x03);
      const blue = b & 0x0f;
      this.palette[start + i] = [red * 17, green * 17, blue * 17, 255];
    }
  }

  tile(data, xor) {
    const first = data[0] & 0x0f;
    const second = data[1] & 0x0f;
    const row = data[2] & 0x1f;
    const column = data[3] & 0x3f;
    const left = column * 6 + this.scrollX;
    const top = row * 12 + this.scrollY;
    if (left >= WIDTH || top >= HEIGHT) return;
    for (let y = 0; y < 12 && top + y < HEIGHT; y++) {
      const bits = data[4 + y] & 0x3f;
      for (let x = 0; x < 6 && left + x < WIDTH; x++) {
        if (!(bits & (1 << (5 - x))) && !xor) continue;
        const at = (top + y) * WIDTH + left + x;
        const value = bits & (1 << (5 - x)) ? second : first;
        this.pixels[at] = xor ? this.pixels[at] ^ value : value;
      }
    }
  }

  scroll(data, copy) {
    const colorIndex = data[0] & 0x0f;
    const h = data[1] & 0x3f;
    const v = data[2] & 0x3f;
    const hMode = (h >> 4) & 0x03;
    const vMode = (v >> 4) & 0x03;
    const nextX = Math.min(h & 0x07, 5);
    const nextY = Math.min(v & 0x0f, 11);
    let dx = nextX - this.scrollX;
    let dy = this.scrollY - nextY;
    this.scrollX = nextX;
    this.scrollY = nextY;
    if (hMode === 2) dx -= 6;
    if (hMode === 1) dx += 6;
    if (vMode === 2) dy -= 12;
    if (vMode === 1) dy += 12;
    if (!dx && !dy) return;
    const source = this.pixels.slice();
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const sx = x - dx;
        const sy = y - dy;
        if (sx >= 0 && sx < WIDTH && sy >= 0 && sy < HEIGHT) this.pixels[y * WIDTH + x] = source[sy * WIDTH + sx];
        else if (copy) this.pixels[y * WIDTH + x] = source[((sy % HEIGHT) + HEIGHT) % HEIGHT * WIDTH + ((sx % WIDTH) + WIDTH) % WIDTH];
        else this.pixels[y * WIDTH + x] = colorIndex;
      }
    }
  }

  draw(context, seconds) {
    const target = Math.floor(Math.max(0, seconds) * PACKETS_PER_SECOND);
    this.processUntil(target);
    const frame = context.createImageData(WIDTH, HEIGHT);
    const out = frame.data;
    for (let i = 0, p = 0; i < this.pixels.length; i++, p += 4) {
      const index = this.pixels[i] & 0x0f;
      const rgba = this.palette[index];
      out[p] = rgba[0];
      out[p + 1] = rgba[1];
      out[p + 2] = rgba[2];
      out[p + 3] = index === this.transparentColor ? 0 : 255;
    }
    context.putImageData(frame, 0, 0);
  }
}
